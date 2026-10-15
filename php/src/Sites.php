<?php
declare(strict_types=1);
namespace Baize;
final class Sites
{
    private static ?array $suffixRules=null;
    public static function dnsHost(string $host):bool
    {
        if(strlen($host)>253||!preg_match('/^[a-z0-9.-]+$/D',$host))return false;
        foreach(explode('.',$host) as $label)if(strlen($label)>63||!preg_match('/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/D',$label))return false;
        return true;
    }
    /** Fixed PSL includes ICANN + private hosting rules, wildcards and exceptions. */
    public static function registrableDomain(string $host):?string
    {
        $host=strtolower($host);if(!self::dnsHost($host)||filter_var($host,FILTER_VALIDATE_IP)||!str_contains($host,'.'))return null;
        if(self::$suffixRules===null){$file=dirname(__DIR__).'/resources/public_suffix_list.ascii.dat';$raw=@file_get_contents($file);if($raw===false||!hash_equals('a849dfdabf33e96c4183c639046f890ad42b5bd526c1b20c4a5de6c0a1f73b90',hash('sha256',$raw)))throw new \RuntimeException('PUBLIC_SUFFIX_RESOURCE_INVALID');self::$suffixRules=array_fill_keys(explode("\n",trim($raw)),true);}
        $labels=explode('.',$host);$count=count($labels);$suffix=1;
        for($i=0;$i<$count;$i++){$candidate=implode('.',array_slice($labels,$i));if(isset(self::$suffixRules['!'.$candidate])){$suffix=$count-$i-1;break;}if(isset(self::$suffixRules[$candidate]))$suffix=max($suffix,$count-$i);if($i+1<$count&&isset(self::$suffixRules['*.'.implode('.',array_slice($labels,$i+1))]))$suffix=max($suffix,$count-$i);}
        return $count<=$suffix?null:implode('.',array_slice($labels,-($suffix+1)));
    }
    public static function validAliases(string $domain,array $hosts):bool
    {
        if(!$hosts)return true;$primary=strtolower((string)(parse_url('https://'.$domain,PHP_URL_HOST)?:explode(':',$domain)[0]));$parent=self::registrableDomain($primary);if(!$parent)return false;
        foreach($hosts as $host)if(!is_string($host)||!self::dnsHost($host)||filter_var($host,FILTER_VALIDATE_IP)||self::registrableDomain($host)!==$parent)return false;return true;
    }
    public static function cookieDomain(mixed $wanted,string $originHost,string $siteDomain,array $allowedHosts=[]):?string
    {
        if(!is_string($wanted))return null;$wanted=strtolower($wanted);if(str_starts_with($wanted,'.'))$wanted=substr($wanted,1);$originHost=strtolower($originHost);$primary=strtolower((string)(parse_url('https://'.$siteDomain,PHP_URL_HOST)?:explode(':',$siteDomain)[0]));
        if(!in_array($originHost,array_merge([$primary],$allowedHosts),true)||!self::dnsHost($wanted)||!str_contains($wanted,'.')||preg_match('/^\d[\d.]*$/D',$wanted)||($originHost!==$wanted&&!str_ends_with($originHost,'.'.$wanted)))return null;
        $parent=self::registrableDomain($wanted);return $parent!==null&&$parent===self::registrableDomain($primary)?$wanted:null;
    }
    public static function text(mixed $value,int $min,int $max,string $field):string
    {
        if(!is_string($value))Http::error(400,'invalid_request',"字段 $field 必须是文本");$length=function_exists('mb_strlen')?mb_strlen($value,'UTF-8'):strlen(iconv('UTF-8','UTF-16LE',$value)?:'')/2;
        if($length<$min||$length>$max||str_contains($value,"\0"))Http::error(400,'invalid_request',"字段 $field 长度无效");return $value;
    }
    public static function instant(mixed $value,bool $future=false):?string
    {
        if($value===null||$value==='')return null;if(!is_string($value)||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D',$value)||strtotime($value)===false||($future&&strtotime($value)<=time()))Http::error(400,'invalid_expiry');return gmdate('Y-m-d\TH:i:s\Z',strtotime($value));
    }
    public static function publicSite(array $site):array{unset($site['salt_secret']);if(isset($site['config']))unset($site['config']['write_key_hash']);return $site;}
    public static function allowsOrigin(array $site,string $origin):bool
    {
        $u=parse_url($origin);if(!$u||!in_array($u['scheme']??'',['https','http'],true)||!isset($u['host'])||isset($u['user'])||isset($u['pass']))return false;
        $host=strtolower($u['host']);$domain=strtolower($site['domain']);$authority=$host.(isset($u['port'])?':'.$u['port']:'');
        return $authority===$domain||$host===$domain||(($u['scheme']??'')==='https'&&!isset($u['port'])&&in_array($host,$site['config']['allowed_hosts']??[],true)&&self::validAliases($domain,[$host]));
    }
    private static function definition(array $input):array
    {
        $name=self::text($input['name']??null,1,128,'name');$domain=strtolower(preg_replace('~^https?://~i','',self::text($input['domain']??null,1,256,'domain')));$domain=explode('/',$domain)[0];
        if(!preg_match('/^[a-z0-9][a-z0-9.:-]*$/D',$domain)||str_contains($domain,'..'))Http::error(400,'invalid_domain');
        $tz=(string)($input['timezone']??'Asia/Shanghai');try{new \DateTimeZone($tz);}catch(\Throwable){Http::error(400,'invalid_timezone');}
        $privacy=$input['privacy_mode']??'standard';if(!in_array($privacy,['standard','daily_salt'],true))Http::error(400,'invalid_privacy_mode');
        $days=$input['retention_days']??365;if(!is_int($days)||$days<1||$days>3650)Http::error(400,'invalid_retention');
        $tags=$input['tags']??[];if(!is_array($tags)||count($tags)>20||!array_is_list($tags))Http::error(400,'invalid_tags');foreach($tags as $tag)self::text($tag,0,64,'tag');
        $config=$input['config']??[];if(!is_array($config)||($config!==[]&&array_is_list($config)))Http::error(400,'invalid_config');
        $allowed=['allowed_hosts','consent_required','replay','heatmap','excluded_ips','vitals','experiments','session_timeout_minutes','seoAutoScan','channel_rules','ai_referrer_hosts','write_key_hash'];$config=array_intersect_key($config,array_flip($allowed));
        foreach(['consent_required','replay','heatmap','vitals','experiments','seoAutoScan'] as $key)if(isset($config[$key])&&!is_bool($config[$key]))Http::error(400,'invalid_config',"$key 必须是布尔值");
        if(isset($config['session_timeout_minutes'])&&(!is_int($config['session_timeout_minutes'])||$config['session_timeout_minutes']<1||$config['session_timeout_minutes']>1440))Http::error(400,'invalid_session_timeout');
        foreach(['allowed_hosts'=>20,'excluded_ips'=>100,'ai_referrer_hosts'=>100] as $key=>$max){if(!isset($config[$key]))continue;if(!is_array($config[$key])||!array_is_list($config[$key])||count($config[$key])>$max)Http::error(400,'invalid_config');foreach($config[$key] as &$host){$host=strtolower(trim(self::text($host,1,253,$key)));if($key!=='excluded_ips'&&(!preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/D',$host)||str_contains($host,'..')))Http::error(400,'invalid_config');}unset($host);}
        if(!self::validAliases($domain,$config['allowed_hosts']??[]))Http::error(400,'invalid_allowed_host','别名须为同一可注册域的有效 DNS 主机名');
        if(isset($config['channel_rules'])){if(!is_array($config['channel_rules'])||!array_is_list($config['channel_rules'])||count($config['channel_rules'])>50)Http::error(400,'invalid_channel_rules');foreach($config['channel_rules'] as &$rule){if(!is_array($rule)||array_diff(array_keys($rule),['name','channel','referrer_host','include_subdomains','utm_medium','utm_source']))Http::error(400,'invalid_channel_rules');self::text($rule['name']??null,1,80,'rule.name');if(!in_array($rule['channel']??null,['direct','referral','search','social','ai','paid','email'],true)||(isset($rule['include_subdomains'])&&!is_bool($rule['include_subdomains']))||empty($rule['referrer_host'])&&empty($rule['utm_medium'])&&empty($rule['utm_source']))Http::error(400,'invalid_channel_rules');$rule['include_subdomains']??=false;foreach(['utm_medium','utm_source'] as $key)if(isset($rule[$key]))self::text($rule[$key],1,256,$key);if(isset($rule['referrer_host'])){$rule['referrer_host']=strtolower(trim(self::text($rule['referrer_host'],1,253,'referrer_host')));if(!self::dnsHost($rule['referrer_host']))Http::error(400,'invalid_channel_rules');}}unset($rule);}
        return ['name'=>$name,'domain'=>$domain,'timezone'=>$tz,'privacy_mode'=>$privacy,'retention_days'=>$days,'tags'=>$tags,'config'=>$config];
    }
    private static function siteObject(App $a,string $kind,string $id,string $siteId):array{$v=$a->store->get($kind,$id);if(!$v||($v['site_id']??null)!==$siteId)Http::error(404,'not_found');return $v;}
    /** Preserve event facts while invalidating relationships whose old raw source expired. */
    private static function invalidateAnalysisConfiguration(App $a,string $id,array $old,array &$site):void
    {
        $cutoff=Analytics::rawBoundary($a,$id,$site);
        foreach($a->store->list('stats_hourly',$id) as $row)if(AnalysisEngine::ms($row['hour'])<$cutoff){$row['data']['sessionConfigurationUnavailable']='configuration_requires_expired_raw_rebuild';$a->store->put('stats_hourly',$row['id']??$id.':'.$row['hour'],$row,$id);}
        foreach(['session_context','session_contributions','sessions'] as $kind)$a->db->exec('DELETE FROM documents WHERE kind=? AND site_id=?',[$kind,$id]);
        if($old['timezone']!==$site['timezone'])foreach($a->db->all('SELECT id,body FROM documents WHERE kind=? AND site_id=?',['visitor_first_seen',$id]) as $record){$row=json_decode($record['body'],true,512,JSON_THROW_ON_ERROR);try{if(!isset($row['first_ts']))throw new \RuntimeException('first_timestamp_missing');$row['first_date']=EventPrivacy::day($row['first_ts'],$site['timezone']);}catch(\Throwable){$site['first_seen_history_complete']=false;continue;}$a->store->put('visitor_first_seen',$record['id'],$row,$id);}
        $state=$a->store->get('aggregation_state',$id)??['id'=>$id,'site_id'=>$id,'generation'=>0];if((int)($state['generation']??0)>=PHP_INT_MAX)throw new \RuntimeException('aggregation_generation_exhausted');$state['generation']=(int)($state['generation']??0)+1;$state['epoch']=$site['epoch'];$state['status']='pending';$state['updated_at']=Store::now();$a->store->put('aggregation_state',$id,$state,$id);
    }
    public static function register(App $a,Router $r):void
    {
        $base='/api/v1/sites/:siteId';
        $r->add('GET','/api/v1/sites',function(Http $q)use($a){$u=$a->auth->user($q);if($q->header('authorization')!==null)Http::error(403,'site_scoped_token');$rows=[];foreach($a->store->list('sites') as $s){$m=$a->store->get('site_members',$s['id'].':'.$u['id']);if(($u['is_admin']??false)||$m){$s['current_role']=$m['role']??'admin';$rows[]=self::publicSite($s);}}return ['sites'=>$rows];});
        $r->add('POST','/api/v1/sites',function(Http $q)use($a){$u=$a->auth->admin($q);$value=self::definition($q->body);$id=bin2hex(random_bytes(12));$site=$a->db->transaction(function()use($a,$u,$value,$id){$a->db->lock('site:'.$id);$site=$value+['id'=>$id,'salt_secret'=>bin2hex(random_bytes(32)),'created_at'=>Store::now(),'epoch'=>Store::uuid()];$a->store->put('sites',$id,$site,$id);$a->store->put('site_members',$id.':'.$u['id'],['site_id'=>$id,'user_id'=>$u['id'],'role'=>'owner'],$id);$a->audit($u['id'],$id,'site.create',['name'=>$site['name']]);return $site;});return Http::json(['site'=>self::publicSite($site)],201);});
        $r->add('GET',$base,function(Http $q)use($a){$id=$q->params['siteId'];$a->auth->authorize($q,$id);return ['site'=>self::publicSite($a->store->get('sites',$id))];});
        $r->add('PATCH',$base,function(Http $q)use($a){$id=$q->params['siteId'];$u=$a->auth->authorize($q,$id,'admin');$site=$a->db->transaction(function()use($a,$q,$id,$u){$a->db->lock('site:'.$id);$a->auth->authorize($q,$id,'admin');$old=$a->store->get('sites',$id);$input=array_replace($old,$q->body);$configPatch=$q->body['config']??[];if(!is_array($configPatch)||($configPatch!==[]&&array_is_list($configPatch)))Http::error(400,'invalid_config');$input['config']=array_replace($old['config']??[],$configPatch);unset($input['config']['write_key_hash']);if(isset($old['config']['write_key_hash']))$input['config']['write_key_hash']=$old['config']['write_key_hash'];$value=self::definition($input);
            if($old['privacy_mode']!==$value['privacy_mode']){foreach(['events','history_manifests','stats_hourly','visitor_first_seen','revenue_orders','experiment_assignments'] as $kind)if($a->store->list($kind,$id))Http::error(409,'identity_mode_locked','站点已有访问历史，请新建站点使用另一访客模式');if(!empty($old['last_event_at']))Http::error(409,'identity_mode_locked','站点已有访问历史，请新建站点使用另一访客模式');}
            $value=array_replace($old,$value);if($old['timezone']!==$value['timezone']||$old['privacy_mode']!==$value['privacy_mode']||($old['config']['session_timeout_minutes']??30)!==($value['config']['session_timeout_minutes']??30)){$value['epoch']=Store::uuid();self::invalidateAnalysisConfiguration($a,$id,$old,$value);foreach(['ai_calls','ai_question_evidence','analytics_snapshots'] as $kind)foreach($a->store->list($kind,$id) as $doc)if(isset($doc['id']))$a->store->delete($kind,$doc['id']);}
            $a->store->put('sites',$id,$value,$id);$a->audit($u['id'],$id,'site.update',['fields'=>array_keys($q->body)]);return $value;});return ['site'=>self::publicSite($site)];});
        $r->add('POST',$base.'/write-key',function(Http $q)use($a){$id=$q->params['siteId'];$u=$a->auth->authorize($q,$id,'admin');$key=Security::randomToken();$a->db->transaction(function()use($a,$id,$key,$u,$q){$a->db->lock('site:'.$id);$a->auth->authorize($q,$id,'admin');$s=$a->store->get('sites',$id);$s['config']['write_key_hash']=Security::hashToken($key);$a->store->put('sites',$id,$s,$id);$a->audit($u['id'],$id,'write_key.rotate',[]);});return ['key'=>$key,'signature'=>'HMAC-SHA256 over canonical sorted-key envelope JSON; X-Baize-Signature hex'];});
        $r->add('GET','/api/tracker/config/:siteId',function(Http $q)use($a){$s=$a->store->get('sites',$q->params['siteId']);if(!$s)Http::error(404,'site_missing');header('Access-Control-Allow-Origin: *');header('Vary: Origin');$cookie=null;$origin=$q->header('origin');if($s['privacy_mode']==='standard'&&$origin&&str_starts_with($origin,'https://')&&self::allowsOrigin($s,$origin))$cookie=self::cookieDomain($q->query['cookie_domain']??null,(string)parse_url($origin,PHP_URL_HOST),$s['domain'],$s['config']['allowed_hosts']??[]);return ['cookie_domain'=>$cookie,'privacy_mode'=>$s['privacy_mode'],'consent_required'=>$s['config']['consent_required']??false,'replay'=>$s['config']['replay']??false,'heatmap'=>$s['config']['heatmap']??false,'vitals'=>$s['config']['vitals']??false];});
    }
}
