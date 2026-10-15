<?php
declare(strict_types=1);
namespace Baize;

/** GeoLite database credentials stay encrypted; raw IPs exist only during lookup. */
final class GeoIP
{
    private const MAX_ARCHIVE=134217728;
    private const MAX_DATABASE=134217728;
    private static bool $loader=false;
    public static function reader(string $path):\MaxMind\Db\Reader
    {
        if(!extension_loaded('bcmath')&&!extension_loaded('gmp'))throw new \RuntimeException('geoip_bcmath_or_gmp_required');
        if(!self::$loader){spl_autoload_register(static function(string $class):void{if(str_starts_with($class,'MaxMind\\Db\\')){$part=substr($class,11);if(!preg_match('/^[A-Za-z0-9_\\\\]+$/D',$part))return;$file=dirname(__DIR__).'/third_party/maxmind-db/src/MaxMind/Db/'.str_replace('\\','/',$part).'.php';if(is_file($file))require_once $file;}});self::$loader=true;}
        return new \MaxMind\Db\Reader($path);
    }
    public static function status(App $app):array
    {
        $path=$app->config['data_dir'].'/GeoLite2-City.mmdb';
        try{if(!is_file($path)||is_link($path))throw new \RuntimeException('missing');$reader=self::reader($path);$metadata=$reader->metadata();$reader->close();return ['configured'=>true,'available'=>true,'checksum'=>hash_file('sha256',$path),'databaseType'=>$metadata->databaseType,'buildEpoch'=>$metadata->buildEpoch];}
        catch(\Throwable){return ['configured'=>false,'available'=>false,'warning'=>'地域保持未知；请配置并校验官方 GeoLite2-City 数据库'];}
    }
    public static function lookup(App $app,string $ip):array
    {
        $unknown=['country'=>'unknown','region'=>'unknown','city'=>'unknown'];$c=$app->store->get('instance_settings','geoip');if(!($c['enabled']??false)||!filter_var($ip,FILTER_VALIDATE_IP))return $unknown;
        try{$reader=self::reader($app->config['data_dir'].'/GeoLite2-City.mmdb');try{$v=$reader->get($ip)??[];}finally{$reader->close();}return ['country'=>$v['country']['iso_code']??'unknown','region'=>$v['subdivisions'][0]['names']['zh-CN']??$v['subdivisions'][0]['names']['en']??'unknown','city'=>$v['city']['names']['zh-CN']??$v['city']['names']['en']??'unknown'];}catch(\Throwable){return $unknown;}
    }
    /** Transport may be injected only by an in-process test; no HTTP transport override. */
    public static function refresh(App $app,?callable $transport=null):array
    {
        $c=$app->store->get('instance_settings','geoip');if(!($c['enabled']??false))Http::error(409,'geoip_not_configured');
        $secret=json_decode(Security::unseal($c['encrypted'],$app->config),true,8,JSON_THROW_ON_ERROR);if(!preg_match('/^\d+$/D',(string)($secret['accountId']??''))||empty($secret['licenseKey']))Http::error(409,'geoip_not_configured');
        $transport??=static fn(string $url,array $options):array=>Outbound::request($url,$options);
        $headers=['authorization'=>'Basic '.base64_encode($secret['accountId'].':'.$secret['licenseKey'])];$base='https://download.maxmind.com/geoip/databases/GeoLite2-City/download';
        $private=$app->config['data_dir'].'/geoip-'.bin2hex(random_bytes(8));if(!mkdir($private,0700))throw new \RuntimeException('geoip_temp_unavailable');
        try{
            $check=$transport($base.'?suffix=tar.gz.sha256',['headers'=>$headers,'maxBytes'=>10000]);$hash=strtolower(strtok(trim($check['text']??'')," \t\r\n")?:'');if(($check['status']??0)!==200||!preg_match('/^[a-f0-9]{64}$/D',$hash))throw new \RuntimeException('geoip_checksum_unavailable');
            $archive=$private.'/database.tar.gz';$sink=fopen($archive,'x+b');if(!$sink)throw new \RuntimeException('geoip_archive_unavailable');chmod($archive,0600);
            try{$response=$transport($base.'?suffix=tar.gz',['headers'=>$headers,'maxBytes'=>self::MAX_ARCHIVE,'sink'=>$sink]);if(isset($response['text'])&&$response['text']!==''){if(strlen($response['text'])>self::MAX_ARCHIVE)throw new \RuntimeException('geoip_archive_too_large');fwrite($sink,$response['text']);}if(!fflush($sink)||($response['status']??0)!==200)throw new \RuntimeException('geoip_download_failed');}finally{fclose($sink);}
            if(!hash_equals($hash,hash_file('sha256',$archive)))throw new \RuntimeException('geoip_checksum_mismatch');
            $tar=new \PharData($archive);$matches=[];
            foreach(new \RecursiveIteratorIterator($tar) as $entry){$name=$entry->getFilename();if($name!=='GeoLite2-City.mmdb')continue;if(!$entry->isFile()||$entry->isLink()||$entry->getSize()>self::MAX_DATABASE)throw new \RuntimeException('geoip_archive_invalid');$matches[]=$entry->getPathname();}
            if(count($matches)!==1)throw new \RuntimeException('geoip_archive_invalid');$target=$private.'/GeoLite2-City.mmdb';$from=fopen($matches[0],'rb');$to=fopen($target,'xb');if(!$from||!$to)throw new \RuntimeException('geoip_extract_failed');chmod($target,0600);
            try{$bytes=stream_copy_to_stream($from,$to,self::MAX_DATABASE+1);if($bytes===false||$bytes>self::MAX_DATABASE||!fflush($to)||(function_exists('fsync')&&!fsync($to)))throw new \RuntimeException('geoip_database_too_large');}finally{fclose($from);fclose($to);}
            $reader=self::reader($target);$meta=$reader->metadata();$reader->close();if(!in_array($meta->databaseType,['GeoLite2-City','GeoIP2-City'],true))throw new \RuntimeException('geoip_database_type_invalid');
            $app->db->transaction(static function()use($app,$c,$target):void{$app->db->lock('instance:geoip');$current=$app->store->get('instance_settings','geoip');if(!$current||!($current['enabled']??false)||($current['revision']??'')!==$c['revision'])throw new \RuntimeException('geoip_configuration_changed');if(!rename($target,$app->config['data_dir'].'/GeoLite2-City.mmdb'))throw new \RuntimeException('geoip_publish_failed');});
            return ['downloaded'=>true,'database'=>self::status($app)];
        }finally{unset($tar);foreach(glob($private.'/*')?:[] as $file)if(is_file($file))@unlink($file);@rmdir($private);}
    }
    public static function register(App $app,Router $router):void
    {
        $router->add('GET','/api/admin/geoip',static function(Http $r)use($app):array{$app->auth->admin($r);$c=$app->store->get('instance_settings','geoip');return ['hasCredentials'=>$c!==null,'enabled'=>(bool)($c['enabled']??false),'credentialFingerprint'=>$c?substr(hash('sha256',$c['encrypted']),0,12):null,'database'=>self::status($app),'provider'=>'MaxMind GeoLite2-City','verification'=>'official HTTPS + SHA256'];});
        $router->add('PUT','/api/admin/geoip',static function(Http $r)use($app):array{$u=$app->auth->admin($r);if(!is_bool($r->body['enabled']??null))Http::error(400,'invalid_request');return $app->db->transaction(static function()use($app,$r,$u):array{$app->db->lock('instance:geoip');$prior=$app->store->get('instance_settings','geoip');$secret=$prior?json_decode(Security::unseal($prior['encrypted'],$app->config),true,8,JSON_THROW_ON_ERROR):[];foreach(['accountId'=>100,'licenseKey'=>2000] as $key=>$limit)if(isset($r->body[$key])){if(!is_string($r->body[$key])||strlen($r->body[$key])<1||strlen($r->body[$key])>$limit)Http::error(400,'invalid_request');$secret[$key]=$r->body[$key];}if(!preg_match('/^\d+$/D',(string)($secret['accountId']??''))||empty($secret['licenseKey']))Http::error(400,'geoip_credentials_required');$row=['id'=>'geoip','enabled'=>$r->body['enabled'],'encrypted'=>Security::seal(json_encode($secret,JSON_THROW_ON_ERROR),$app->config),'revision'=>Store::uuid(),'updated_at'=>Store::now()];$app->store->put('instance_settings','geoip',$row);$app->audit($u['id'],null,'geoip.configure',['enabled'=>$row['enabled']]);return ['saved'=>true,'enabled'=>$row['enabled']];});});
        $router->add('POST','/api/admin/geoip/refresh',static function(Http $r)use($app):array{$u=$app->auth->admin($r);try{$result=self::refresh($app);$app->audit($u['id'],null,'geoip.refresh',['verified'=>true]);return $result;}catch(HttpError $e){throw $e;}catch(\Throwable){Http::error(502,'geoip_refresh_failed');}});
    }
}
