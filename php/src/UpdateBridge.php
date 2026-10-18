<?php
declare(strict_types=1);
namespace Baize;

/** A fixed Unix socket is the sole authority; no paths/URLs/commands come from HTTP. */
final class UpdateBridge
{
    public static function identity():?array
    {
        $path=dirname(__DIR__).'/release-manifest.json';if(!is_file($path))return null;
        $m=json_decode((string)file_get_contents($path),true,64,JSON_THROW_ON_ERROR);
        return ['revision'=>$m['revision']??null,'manifestSha256'=>hash_file('sha256',$path),'launchId'=>getenv('BAIZE_UPDATE_LAUNCH_ID')?:null];
    }
    public static function schemaBlocked(array $config):bool
    {
        $path=($config['data_dir']??'').'/schema-migration-intent.json';if(!file_exists($path)&&!is_link($path))return false;
        try{$s=lstat($path);if(!$s||is_link($path)||!is_file($path)||$s['nlink']!==1||$s['size']>65536||($s['mode']&0077)!==0)return true;$intent=json_decode((string)file_get_contents($path),true,32,JSON_THROW_ON_ERROR);return ($intent['status']??'')!=='completed';}catch(\Throwable){return true;}
    }
    public static function maintenance():bool
    {
        $gate=getenv('BAIZE_UPDATE_GATE');return $gate!==false&&$gate!==''&&file_exists($gate);
    }
    public static function request(string $action,array $body=[]):array
    {
        $socket=getenv('BAIZE_UPDATE_SOCKET');if(!$socket)throw new \RuntimeException('UPDATE_EXECUTOR_NOT_CONFIGURED');
        $stat=@lstat($socket);if(!$stat||($stat['mode']&0170000)!==0140000||($stat['mode']&0007)!==0||is_link($socket))throw new \RuntimeException('UPDATE_EXECUTOR_SOCKET_UNTRUSTED');
        $curl=curl_init('http://localhost/'.($action==='status'?'status':'commands'));
        curl_setopt_array($curl,[CURLOPT_UNIX_SOCKET_PATH=>$socket,CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>5,CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_PROTOCOLS=>CURLPROTO_HTTP]);
        if($action!=='status')curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode(['action'=>$action]+$body,JSON_THROW_ON_ERROR)]);
        $data='';curl_setopt($curl,CURLOPT_WRITEFUNCTION,static function($c,string $chunk)use(&$data):int{if(strlen($data)+strlen($chunk)>8388608)return 0;$data.=$chunk;return strlen($chunk);});
        $ok=curl_exec($curl);$status=curl_getinfo($curl,CURLINFO_RESPONSE_CODE);curl_close($curl);
        if($ok===false)throw new \RuntimeException('UPDATE_EXECUTOR_UNAVAILABLE');$result=json_decode($data,true,64,JSON_THROW_ON_ERROR);
        if(!in_array($status,[200,202],true))throw new \RuntimeException(preg_match('/^UPDATE_[A-Z_]+$/D',$result['error']??'')?$result['error']:'UPDATE_EXECUTOR_REJECTED');
        if(!is_array($result))throw new \RuntimeException('UPDATE_EXECUTOR_RESPONSE_INVALID');return $result;
    }
    public static function owner(App $a,Http $r):array
    {
        $u=$a->auth->admin($r);$claim=$a->store->get('install','state');
        if(!empty($claim['claimed_user_id'])&&$claim['claimed_user_id']!==$u['id'])Http::error(403,'UPDATE_INSTANCE_OWNER_REQUIRED');
        return $u;
    }
    public static function status(App $a,Http $r):array
    {
        $u=self::owner($a,$r);try{$remote=self::request('status');if(($remote['ownerId']??null)!==$u['id'])Http::error(403,'UPDATE_INSTANCE_OWNER_REQUIRED');return ['configured'=>true]+$remote;}
        catch(HttpError $e){throw $e;}catch(\Throwable $e){return ['configured'=>false,'runtime'=>'php','profile'=>'standard','phase'=>'idle','deploymentMode'=>'php-fpm-unmanaged','mechanism'=>'file-delta','current'=>self::identity(),'reason'=>preg_match('/^UPDATE_[A-Z_]+$/D',$e->getMessage())?$e->getMessage():'UPDATE_EXECUTOR_UNAVAILABLE'];}
    }
    public static function command(App $a,Http $r,string $action):array
    {
        $url=parse_url($a->config['public_url']);$origin=($url['scheme']??'https').'://'.($url['host']??'').(isset($url['port'])?':'.$url['port']:'');if($r->header('origin')!==$origin)Http::error(403,'csrf_origin_denied');
        $u=self::owner($a,$r);$allowed=['operationId','expectedRevision','expectedManifestSha256'];foreach(array_keys($r->body) as $key)if(!in_array($key,$allowed,true))Http::error(400,'UPDATE_REQUEST_INVALID');
        $body=$r->body;if($action!=='check'&&(!is_string($body['operationId']??null)||!preg_match('/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/D',$body['operationId'])))Http::error(400,'update_operation_id_required');
        if($action==='apply'&&(!preg_match('/^[a-f0-9]{40}$/D',$body['expectedRevision']??'')||!preg_match('/^[a-f0-9]{64}$/D',$body['expectedManifestSha256']??'')))Http::error(400,'update_release_preview_required');
        try{$remote=self::request('status');if(($remote['ownerId']??null)!==$u['id'])Http::error(403,'UPDATE_INSTANCE_OWNER_REQUIRED');$defer=$action!=='check'&&function_exists('fastcgi_finish_request');$result=self::request($action,['actorId'=>$u['id'],'awaitResponse'=>$defer]+$body);$a->audit($u['id'],null,'instance_update_'.$action,['operationId'=>$body['operationId']??null]);
            if(($result['awaitResponse']??false)&&$defer){register_shutdown_function(static function()use($u,$body):void{fastcgi_finish_request();try{self::request('acknowledge',['actorId'=>$u['id'],'operationId'=>$body['operationId']]);}catch(\Throwable){error_log('Baize update acknowledgement unavailable; inspect persisted operation status');}});}
            return Http::json($result,202);}
        catch(HttpError $e){throw $e;}catch(\Throwable $e){$code=preg_match('/^UPDATE_[A-Z_]+$/D',$e->getMessage())?$e->getMessage():'UPDATE_EXECUTOR_UNAVAILABLE';Http::error($code==='UPDATE_BUSY'?409:503,$code);}
    }
}
