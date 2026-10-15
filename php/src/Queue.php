<?php
declare(strict_types=1);
namespace Baize;

/** InnoDB-backed leases; completion is fenced by token and enqueue revision. */
final class Queue
{
    /** Administrator replay revokes old tokens, including a still-running stale lease. */
    public static function replay(App $app,string $siteId):int
    {
        $count=0;foreach($app->store->list('queue_jobs',$siteId) as $candidate){if($candidate['status']==='complete')continue;$app->db->lock('queue:'.$candidate['id']);$job=$app->store->get('queue_jobs',$candidate['id']);if(!$job||$job['status']==='complete')continue;$job['revision']++;$job['status']='pending';$job['attempts']=0;$job['available_at']=Store::now();$job['lease_token']=$job['lease_until']=$job['worker_id']=$job['error']=null;$app->store->put('queue_jobs',$job['id'],$job,$siteId);$count++;}return $count;
    }
    public static function enqueue(App $app,string $type,string $siteId,array $payload=[],?string $dedupe=null):string
    {
        return $app->db->transaction(function()use($app,$type,$siteId,$payload,$dedupe){
            $id=$dedupe!==null?hash('sha256',$dedupe):Store::uuid();$app->db->lock('queue:'.$id);$old=$app->store->get('queue_jobs',$id);$now=Store::now();
            $job=['id'=>$id,'type'=>$type,'site_id'=>$siteId,'payload'=>$payload,'status'=>'pending','revision'=>($old['revision']??0)+1,'attempts'=>0,'available_at'=>$now,'created_at'=>$old['created_at']??$now,'updated_at'=>$now,'lease_token'=>null,'lease_until'=>null,'worker_id'=>null,'error'=>null];
            if($old&&$old['status']==='running'&&isset($old['lease_until'])&&EventPrivacy::millis($old['lease_until'])>microtime(true)*1000){foreach(['status','attempts','lease_token','lease_until','worker_id'] as $key)$job[$key]=$old[$key];}
            $app->store->put('queue_jobs',$id,$job,$siteId);return $id;
        });
    }
    public static function claim(App $app,string $workerId,int $leaseSeconds=300):?array
    {
        return $app->db->transaction(function()use($app,$workerId,$leaseSeconds){
            $app->db->lock('queue:claim');$now=microtime(true)*1000;$jobs=$app->store->list('queue_jobs');usort($jobs,fn($a,$b)=>strcmp($a['available_at'],$b['available_at'])?:strcmp($a['id'],$b['id']));
            foreach($jobs as $candidate){if(in_array($candidate['status'],['complete','dead'],true)||EventPrivacy::millis($candidate['available_at'])>$now||$candidate['status']==='running'&&EventPrivacy::millis($candidate['lease_until'])>$now)continue;
                $app->db->lock('queue:'.$candidate['id']);$job=$app->store->get('queue_jobs',$candidate['id']);
                if(!$job||in_array($job['status'],['complete','dead'],true)||EventPrivacy::millis($job['available_at'])>$now||$job['status']==='running'&&EventPrivacy::millis($job['lease_until'])>$now)continue;
                $job['status']='running';$job['worker_id']=$workerId;$job['lease_token']=bin2hex(random_bytes(24));$job['lease_until']=EventPrivacy::iso($now+max(5,$leaseSeconds)*1000);$job['attempts']++;$job['updated_at']=Store::now();$app->store->put('queue_jobs',$job['id'],$job,$job['site_id']);return $job;
            }return null;
        });
    }
    public static function renew(App $app,array $claim,string $workerId,int $leaseSeconds=300):bool
    {
        return $app->db->transaction(function()use($app,$claim,$workerId,$leaseSeconds){$app->db->lock('queue:'.$claim['id']);$job=$app->store->get('queue_jobs',$claim['id']);if(!self::owns($job,$claim,$workerId))return false;$job['lease_until']=EventPrivacy::iso(microtime(true)*1000+max(5,$leaseSeconds)*1000);$app->store->put('queue_jobs',$job['id'],$job,$job['site_id']);return true;});
    }
    private static function owns(?array $job,array $claim,string $workerId):bool
    {return $job&&$job['status']==='running'&&$job['worker_id']===$workerId&&is_string($job['lease_token'])&&hash_equals($job['lease_token'],$claim['lease_token'])&&EventPrivacy::millis($job['lease_until'])>microtime(true)*1000;}
    public static function complete(App $app,array $claim,string $workerId):bool
    {
        return $app->db->transaction(function()use($app,$claim,$workerId){$app->db->lock('queue:'.$claim['id']);$job=$app->store->get('queue_jobs',$claim['id']);if(!self::owns($job,$claim,$workerId))return false;$job['status']=$job['revision']===$claim['revision']?'complete':'pending';$job['completed_at']=$job['status']==='complete'?Store::now():null;$job['available_at']=Store::now();$job['lease_token']=$job['lease_until']=$job['worker_id']=null;$job['updated_at']=Store::now();$job['error']=null;$app->store->put('queue_jobs',$job['id'],$job,$job['site_id']);return true;});
    }
    public static function fail(App $app,array $claim,string $workerId,string $error):bool
    {
        return $app->db->transaction(function()use($app,$claim,$workerId,$error){$app->db->lock('queue:'.$claim['id']);$job=$app->store->get('queue_jobs',$claim['id']);if(!self::owns($job,$claim,$workerId))return false;$newer=$job['revision']!==$claim['revision'];$job['status']=!$newer&&$job['attempts']>=8?'dead':'pending';$job['available_at']=EventPrivacy::iso(microtime(true)*1000+($newer?0:min(3600,2**$job['attempts']))*1000);$job['error']=substr($error,0,512);$job['lease_token']=$job['lease_until']=$job['worker_id']=null;$job['updated_at']=Store::now();$app->store->put('queue_jobs',$job['id'],$job,$job['site_id']);return true;});
    }
}
