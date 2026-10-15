<?php
declare(strict_types=1);
namespace Baize;

final class Worker
{
    public static function once(App $app,?string $workerId=null):array
    {
        // CLI workers do not register HTTP routes. Repair durable privacy records
        // before any scheduled export, notification or provider task can read data.
        Governance::configure($app->config,$app->store);Governance::replayJournal($app);
        self::schedule($app);$ticks=[];foreach([Operations::class,External::class] as $class)if(class_exists($class)&&method_exists($class,'tick'))$ticks[$class]=$class::tick($app);
        $workerId??=gethostname().':'.getmypid().':'.bin2hex(random_bytes(4));$claim=Queue::claim($app,$workerId);if(!$claim)return ['worked'=>false,'ticks'=>$ticks];
        try{
            if($claim['type']==='aggregate')$result=self::aggregate($app,$claim['site_id']);
            elseif($claim['type']==='retention')$result=self::retention($app,$claim['site_id']);
            elseif(class_exists(External::class)&&method_exists(External::class,'work'))$result=External::work($app,$claim);
            else throw new \RuntimeException('unsupported_job_type:'.$claim['type']);
            if(!Queue::complete($app,$claim,$workerId))return ['worked'=>true,'id'=>$claim['id'],'status'=>'lease_lost'];
            return ['worked'=>true,'id'=>$claim['id'],'status'=>'complete','result'=>$result];
        }catch(\Throwable $error){$code=$error instanceof HttpError?$error->errorCode:get_class($error);Queue::fail($app,$claim,$workerId,$code);$app->db->transaction(function()use($app,$claim,$code){$app->db->lock('site:'.$claim['site_id']);$state=$app->store->get('aggregation_state',$claim['site_id'])??['id'=>$claim['site_id'],'site_id'=>$claim['site_id']];$state['attempts']=$claim['attempts'];$state['last_error']=$code;$state['dead_letter_at']=$claim['attempts']>=8?Store::now():null;$app->store->put('aggregation_state',$claim['site_id'],$state,$claim['site_id']);});return ['worked'=>true,'id'=>$claim['id'],'status'=>'retry','error'=>$code];}
    }
    public static function aggregate(App $app,string $siteId):array
    {
        return $app->db->transaction(function()use($app,$siteId){
            $app->db->lock('site:'.$siteId);$site=$app->store->get('sites',$siteId);if(!$site)return ['site_missing'=>true];
            $events=array_values(array_filter($app->store->list('events',$siteId),fn($event)=>!EventPrivacy::deleted($app->store,$siteId,$event)));
            $sessions=Sessionizer::rebuild($app,$siteId);
            if(!class_exists(AnalysisEngine::class)||!method_exists(AnalysisEngine::class,'buckets'))throw new \RuntimeException('analysis_engine_unavailable');
            $goals=$app->store->list('goals',$siteId);$funnels=$app->store->list('funnels',$siteId);$buckets=AnalysisEngine::buckets($events,$sessions,$goals,$funnels);
            $cutoff=microtime(true)*1000-(int)($site['retention_days']??365)*86400000;$hours=[];
            self::updateCrossingContributions($app,$siteId,$sessions,$goals,$funnels,$cutoff);
            foreach($buckets as $hour=>$data){$id=$siteId.':'.$hour;$old=$app->store->get('stats_hourly',$id);$start=EventPrivacy::millis($hour);if($start<$cutoff&&$old)continue;$app->store->put('stats_hourly',$id,['id'=>$id,'site_id'=>$siteId,'hour'=>$hour,'data'=>$data,'complete'=>$start>=$cutoff&&$start+3600000<=microtime(true)*1000,'updated_at'=>Store::now()],$siteId);$hours[$hour]=true;}
            // Removed in-retention events must remove stale derived buckets on rebuild.
            foreach($app->store->list('stats_hourly',$siteId) as $row)if(EventPrivacy::millis($row['hour'])>=$cutoff&&!isset($hours[$row['hour']]))$app->store->delete('stats_hourly',$row['id']??$siteId.':'.$row['hour']);
            $state=$app->store->get('aggregation_state',$siteId)??['id'=>$siteId,'site_id'=>$siteId];$state['generation']??=0;$state=array_replace($state,['watermark'=>Store::now(),'processed_events'=>count($events),'processed_generation'=>$state['generation'],'sessions'=>count($sessions),'attempts'=>0,'last_error'=>null,'dead_letter_at'=>null,'updated_at'=>Store::now()]);$app->store->put('aggregation_state',$siteId,$state,$siteId);
            return ['events'=>count($events),'sessions'=>count($sessions),'hours'=>count($buckets)];
        });
    }
    private static function contribution(array $session,array $goals,array $funnels):array
    {
        $result=[];foreach(AnalysisEngine::buckets($session['events'],[$session],$goals,$funnels) as $hour=>$bucket){$r=array_intersect_key($bucket,array_flip(['sessions','bounces','duration_s','visible_ms','goals','goalAttribution','paths','funnels']));$r['pages']=[];foreach($bucket['pages'] as $path=>$page)$r['pages'][$path]=array_intersect_key($page,array_flip(['entries','exits','bounces','visible_ms','completed']));$r['segments']=[];foreach($bucket['segments'] as $segment=>$data)$r['segments'][$segment]=array_intersect_key($data,array_flip(['sessions','goals']));$result[$hour]=$r;}return $result;
    }
    private static function numericDelta(array &$target,array $before,array $after):void
    {
        foreach(array_unique(array_merge(array_keys($before),array_keys($after))) as $key){$a=$before[$key]??0;$b=$after[$key]??0;if(is_array($a)||is_array($b)){$target[$key]=is_array($target[$key]??null)?$target[$key]:[];self::numericDelta($target[$key],is_array($a)?$a:[],is_array($b)?$b:[]);}else{$target[$key]=($target[$key]??0)+$b-$a;}}
    }
    /** Update only session facts in old immutable event buckets, never replay raw PV/revenue. */
    private static function updateCrossingContributions(App $app,string $siteId,array $sessions,array $goals,array $funnels,float $cutoff):void
    {
        $live=[];foreach($sessions as $session){$id=$siteId.':'.$session['id'];$live[$id]=true;$previous=$app->store->get('session_contributions',$id);$current=self::contribution($session,$goals,$funnels);
            if($previous)foreach($current as $hour=>$after){if(EventPrivacy::millis($hour)>=$cutoff)continue;$archive=$app->store->get('stats_hourly',$siteId.':'.$hour);if(!$archive)continue;$before=$previous['hours'][$hour]??[];$afterNumeric=$after;$beforeNumeric=$before;unset($afterNumeric['funnels'],$beforeNumeric['funnels']);self::numericDelta($archive['data'],$beforeNumeric,$afterNumeric);
                foreach($after['funnels']??[] as $funnel=>$steps)foreach($steps as $step=>$visitors){$archive['data']['funnels'][$funnel][$step]??=[];foreach($visitors as $visitor)if(!in_array($visitor,$archive['data']['funnels'][$funnel][$step],true))$archive['data']['funnels'][$funnel][$step][]=$visitor;}
                $archive['updated_at']=Store::now();$app->store->put('stats_hourly',$siteId.':'.$hour,$archive,$siteId);
            }
            $app->store->put('session_contributions',$id,['id'=>$id,'site_id'=>$siteId,'visitor_id'=>$session['visitor_id'],'last_active'=>$session['last_active'],'hours'=>$current],$siteId);
        }
        foreach($app->store->list('session_contributions',$siteId) as $old)if(!isset($live[$old['id']])&&EventPrivacy::millis($old['last_active'])<$cutoff)$app->store->delete('session_contributions',$old['id']);
    }
    public static function retention(App $app,string $siteId):array
    {
        return $app->db->transaction(function()use($app,$siteId){
            $app->db->lock('site:'.$siteId);$site=$app->store->get('sites',$siteId);if(!$site)return ['deleted'=>0];
            // Publish complete old hours before removing raw source; the boundary hour stays explicit.
            self::aggregate($app,$siteId);$before=microtime(true)*1000-(int)($site['retention_days']??365)*86400000;
            Sessionizer::retainContext($app,$siteId,Sessionizer::rebuild($app,$siteId),$before);
            if(!class_exists(Governance::class))throw new \RuntimeException('privacy_journal_unavailable');
            Governance::configure($app->config,$app->store);$pruned=Governance::retention($app,$siteId,EventPrivacy::iso($before));$deleted=$pruned['deleted'];
            $replayBefore=microtime(true)*1000-min(30,(int)($site['retention_days']??365))*86400000;
            if($replayBefore>$before+1000){$replayPruned=Governance::retention($app,$siteId,EventPrivacy::iso($replayBefore),true);$deleted+=$replayPruned['deleted'];}
            foreach($app->store->list('intake_rate',$siteId) as $row)if(isset($row['expires_at'])&&EventPrivacy::millis($row['expires_at'])<microtime(true)*1000)$app->store->delete('intake_rate',$row['id']??'');
            // Rebuild surviving sessions from surviving events, never erase a whole crossing session.
            Sessionizer::rebuild($app,$siteId);return ['deleted'=>$deleted,'before'=>EventPrivacy::iso($before)];
        });
    }
    /** Intended for a 1Panel cron job before processing the queue. */
    public static function schedule(App $app):void
    {
        // Recheck on every invocation; a completed daily job is never re-enqueued.
        // Atomic marker and enqueue prevent concurrent CLI workers scheduling duplicates.
        $app->db->transaction(function()use($app){$app->db->lock('maintenance:schedule');foreach($app->store->list('sites') as $site){$key='retention:'.$site['id'].':'.gmdate('Y-m-d');if($app->store->get('maintenance_schedules',$key))continue;Queue::enqueue($app,'retention',$site['id'],[],$key);$app->store->put('maintenance_schedules',$key,['id'=>$key,'site_id'=>$site['id'],'scheduled_at'=>Store::now()],$site['id']);}});
    }
}
