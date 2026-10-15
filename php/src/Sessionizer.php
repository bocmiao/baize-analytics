<?php
declare(strict_types=1);
namespace Baize;

final class Sessionizer
{
    public static function withContext(App $app,string $siteId,array $site):array
    {
        $records=$app->store->list('privacy_tombstones',$siteId);if(class_exists(Governance::class))$records=array_merge($records,Governance::journal($app->config));
        $records=array_values(array_filter($records,fn($r)=>$r['site_id']===$siteId&&$r['type']!=='retention'));
        $site['_session_context']=[];foreach($app->store->list('session_context',$siteId) as $row)foreach($row['events']??[] as $event){$deleted=false;foreach($records as $record)if(Governance::matches($record,$event)){$deleted=true;break;}if(!$deleted)$site['_session_context'][]=$event;}return $site;
    }
    public static function heartbeatSegment(array $event): string
    {
        $p=$event['payload']??[];
        return isset($p['interval_start'],$p['interval_end']) ? $p['interval_start'].':'.$p['interval_end'] : (string)($p['segment_id']??$event['event_id']);
    }
    public static function heartbeatVisible(array $event): float
    {
        $p=$event['payload']??[]; $limit=isset($p['interval_start'],$p['interval_end']) ? max(0,(float)$p['interval_end']-(float)$p['interval_start']) : 15000;
        return max(0,min($limit,(float)($p['visible_ms']??0)));
    }
    public static function build(array $events,array $site): array
    {
        $sourceIds=array_fill_keys(array_column($events,'event_id'),true);
        $events=array_merge($site['_session_context']??[],$events);
        usort($events,fn($a,$b)=>EventPrivacy::millis($a['ts']) <=> EventPrivacy::millis($b['ts']) ?: strcmp($a['event_id'],$b['event_id']));
        $timeout=(float)($site['config']['session_timeout_minutes']??30); if($timeout<1||$timeout>1440)$timeout=30;
        $sessions=[]; $open=[]; $ids=[]; $heartbeats=[];
        foreach ($events as $event) {
            if (($event['is_bot']??false)||isset($ids[$event['event_id']])) continue;
            $ids[$event['event_id']]=true;
            $key=$event['visitor_id'].(($site['privacy_mode']??'standard')==='daily_salt'?EventPrivacy::day($event['ts'],$site['timezone']??'UTC'):'');
            $index=$open[$key]??null; $at=EventPrivacy::millis($event['ts']);
            if ($index===null || $at-EventPrivacy::millis($sessions[$index]['last_active'])>$timeout*60000) {
                $hex=hash('sha256',$event['site_id'].':'.$key.':'.$event['event_id']);
                $id=substr($hex,0,8).'-'.substr($hex,8,4).'-4'.substr($hex,13,3).'-a'.substr($hex,17,3).'-'.substr($hex,20,12);
                $index=count($sessions); $open[$key]=$index;
                $sessions[]=['id'=>$id,'site_id'=>$event['site_id'],'visitor_id'=>$event['visitor_id'],'started_at'=>EventPrivacy::iso($at),'last_active'=>EventPrivacy::iso($at),'ended_at'=>EventPrivacy::iso($at),'entry_path'=>'','exit_path'=>'','pageviews'=>0,'duration_s'=>0,'duration_ms'=>0,'visible_ms'=>0,'bounced'=>true,'dimensions'=>$event['dimensions']??[],'events'=>[]];
            }
            $s=&$sessions[$index]; $s['events'][]=$event; $s['last_active']=$s['ended_at']=EventPrivacy::iso($at);
            $s['duration_ms']=$at-EventPrivacy::millis($s['started_at']); $s['duration_s']=$s['duration_ms']/1000;
            if($event['type']==='pageview') { if(!$s['pageviews']){$s['entry_path']=$event['path'];$s['dimensions']=$event['dimensions']??[];} $s['exit_path']=$event['path'];$s['pageviews']++; }
            if($event['type']==='heartbeat') { $hb=$s['id'].':'.$event['page_id'].':'.self::heartbeatSegment($event);if(!isset($heartbeats[$hb])){$heartbeats[$hb]=true;$s['visible_ms']+=self::heartbeatVisible($event);} }
            $s['bounced']=$s['pageviews']<=1 && $s['duration_s']<10; unset($s);
        }
        return array_values(array_filter($sessions,fn($s)=>$s['pageviews']>0&&count(array_filter($s['events'],fn($e)=>isset($sourceIds[$e['event_id']])))>0));
    }
    /** Full authoritative rebuild; called inside an existing site-locked transaction. */
    public static function rebuild(App $app,string $siteId): array
    {
        $site=$app->store->get('sites',$siteId);if(!$site)return [];$site=self::withContext($app,$siteId,$site);
        $events=array_values(array_filter($app->store->list('events',$siteId),fn($e)=>!EventPrivacy::deleted($app->store,$siteId,$e)));
        $sessions=self::build($events,$site);
        foreach($app->store->list('sessions',$siteId) as $old)$app->store->delete('sessions',$old['id']);
        foreach($sessions as $session){$session['event_ids']=array_column($session['events'],'event_id');unset($session['events']);$app->store->put('sessions',$session['id'],$session,$siteId);}
        return $sessions;
    }
    /** Only reducer inputs for the live crossing session survive raw retention. */
    public static function retainContext(App $app,string $siteId,array $sessions,float $before):void
    {
        $kept=[];
        foreach($sessions as $session){if(EventPrivacy::millis($session['started_at'])>=$before||EventPrivacy::millis($session['last_active'])<$before)continue;$prefix=[];
            foreach($session['events'] as $event){if(EventPrivacy::millis($event['ts'])>=$before)continue;$p=$event['payload']??[];$reduced=array_intersect_key($p,array_flip(['event_name','visible_ms','interval_start','interval_end','segment_id']));if(isset($p['props']['depth']))$reduced['props']=['depth'=>$p['props']['depth']];$event['payload']=$reduced;unset($event['dimensions']['ip_truncated']);$event['_session_context']=true;$prefix[]=$event;}
            if(!$prefix)continue;$id=$siteId.':'.$session['visitor_id'];$kept[$id]=true;$app->store->put('session_context',$id,['id'=>$id,'site_id'=>$siteId,'visitor_id'=>$session['visitor_id'],'events'=>$prefix,'boundary'=>EventPrivacy::iso($before),'updated_at'=>Store::now()],$siteId);
        }
        foreach($app->store->list('session_context',$siteId) as $row)if(!isset($kept[$row['id']]))$app->store->delete('session_context',$row['id']);
    }
}
