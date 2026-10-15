<?php
declare(strict_types=1);
namespace Baize;

final class Collect
{
    /** Decode JSON without first rounding revenue through a binary float. */
    public static function decode(string $raw,string $encoding=''): array
    {
        if(strlen($raw)>1048576)Http::error(413,'request_too_large');
        if($encoding==='gzip'){$raw=@gzdecode($raw,1048577);if($raw===false)Http::error(400,'invalid_gzip');}
        elseif($encoding!=='')Http::error(415,'unsupported_content_encoding');
        if(strlen($raw)>1048576)Http::error(413,'request_too_large');
        // Native parsing validates the complete grammar/UTF-8 before lexical preservation.
        $decoded=json_decode($raw,true,64,JSON_THROW_ON_ERROR);
        if(!is_array($decoded)||array_is_list($decoded))Http::error(400,'invalid_envelope');
        $offset=0;$length=strlen($raw);
        $parse=function(array $path=[]) use (&$parse,&$offset,$length,$raw):mixed {
            while($offset<$length&&ctype_space($raw[$offset]))$offset++;
            $ch=$raw[$offset];
            if($ch==='{'||$ch==='['){$object=$ch==='{';$offset++;$out=[];$i=0;while(true){while($offset<$length&&ctype_space($raw[$offset]))$offset++;if($raw[$offset]===($object?'}':']')){$offset++;return $object&&count($path)===3&&$path[0]==='events'&&$path[2]==='props'?(object)$out:$out;}if($i){$offset++;while(ctype_space($raw[$offset]))$offset++;}if($object){$key=$parse();while(ctype_space($raw[$offset]))$offset++;$offset++;}else $key=$i;$out[$key]=$parse([...$path,$key]);$i++;}}
            if($ch==='"'){preg_match('/\G"(?:[^"\\\\]|\\\\.)*"/s',$raw,$m,0,$offset);$offset+=strlen($m[0]);return json_decode($m[0],true,64,JSON_THROW_ON_ERROR);}
            preg_match('/\G(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/',$raw,$m,0,$offset);$offset+=strlen($m[0]);
            if(count($path)===3&&$path[0]==='events'&&$path[2]==='revenue'&&preg_match('/^-?\d/',$m[0]))return $m[0];
            return json_decode($m[0],true,64,JSON_THROW_ON_ERROR);
        };
        return $parse();
    }
    /** Nonnegative exact decimal, including exponent notation; no fixed currency scale. */
    public static function decimal(string|int|float $value): string
    {
        $value=(string)$value;if(str_starts_with($value,'-')){if(self::decimal(substr($value,1))==='0')return '0';throw new \InvalidArgumentException('negative_decimal');}if(strlen($value)>1024||!preg_match('/^\+?(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/D',$value,$m))throw new \InvalidArgumentException('invalid_decimal');
        $exponent=(int)($m[3]??0);if(abs($exponent)>1000)throw new \InvalidArgumentException('decimal_exponent_limit');
        $whole=$m[1];$fraction=$m[2]??'';$digits=$whole.$fraction;$point=strlen($whole)+$exponent;
        if($point<0){$out='0.'.str_repeat('0',-$point).$digits;}elseif($point>=strlen($digits)){$out=$digits.str_repeat('0',$point-strlen($digits));}else{$out=substr($digits,0,$point).'.'.substr($digits,$point);}
        [$a,$b]=array_pad(explode('.',$out,2),2,'');$a=ltrim($a,'0');$a=$a===''?'0':$a;$b=rtrim($b,'0');return $a.($b!==''?'.'.$b:'');
    }
    public static function canonical(mixed $value,bool $nodeLocale=false): string
    {
        if(is_object($value)){$properties=get_object_vars($value);self::sortKeys($properties,$nodeLocale);$p=[];foreach($properties as $k=>$v)$p[]=json_encode((string)$k,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_LINE_TERMINATORS|JSON_THROW_ON_ERROR).':'.self::canonical($v,$nodeLocale);return '{'.implode(',',$p).'}';}
        if(is_array($value)){if(array_is_list($value))return '['.implode(',',array_map(fn($v)=>self::canonical($v,$nodeLocale),$value)).']';self::sortKeys($value,$nodeLocale);$p=[];foreach($value as $k=>$v)$p[]=json_encode((string)$k,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_LINE_TERMINATORS|JSON_THROW_ON_ERROR).':'.self::canonical($v,$nodeLocale);return '{'.implode(',',$p).'}';}
        if((is_int($value)||is_float($value))&&$value==0)return '0';
        $json=json_encode($value,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_LINE_TERMINATORS|JSON_THROW_ON_ERROR);
        if(is_float($value)){$json=preg_replace('/\.0e/','e',$json);$json=preg_replace('/e([+-])0+(\d+)/','e$1$2',$json);if(preg_match('/e([+-]?\d+)$/',$json,$m)&&(int)$m[1]>=-6&&(int)$m[1]<21)$json=($value<0?'-':'').self::decimal(ltrim($json,'-'));}
        return $json;
    }
    private static function sortKeys(array &$value,bool $nodeLocale):void
    {
        if($nodeLocale&&class_exists(\Collator::class)){$collator=new \Collator('en_US');uksort($value,fn($a,$b)=>$collator->compare((string)$a,(string)$b));}else ksort($value,SORT_STRING);
    }
    private static function uuid(mixed $value): bool{return is_string($value)&&(bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD',$value);}
    public static function validate(mixed $value): ?array
    {
        if(!is_array($value)||!self::uuid($value['event_id']??null)||!self::uuid($value['page_id']??null)||!array_key_exists('visitor_id',$value)||$value['visitor_id']!==null&&!self::uuid($value['visitor_id']))return null;
        if(!in_array($value['type']??'', ['pageview','event','heartbeat','vitals','revenue','identify','replay','heatmap','consent'],true)||!is_int($value['ts']??null)||$value['ts']<0||$value['ts']>8640000000000000)return null;
        $limits=['url'=>4096,'path'=>2048,'referrer'=>4096,'title'=>512,'event_name'=>128,'user_id'=>256,'order_id'=>128,'screen'=>64,'language'=>64,'utm_source'=>256,'utm_medium'=>256,'utm_campaign'=>256,'utm_term'=>256,'utm_content'=>256];
        foreach($limits as $k=>$max)if(isset($value[$k])&&(!is_string($value[$k])||mb_strlen($value[$k])>$max))return null;
        foreach(['event_name','user_id','order_id'] as $k)if(isset($value[$k])&&$value[$k]==='')return null;
        if(!isset($value['url'],$value['path'])||!preg_match('~^https?://~',$value['url'])||filter_var($value['url'],FILTER_VALIDATE_URL)===false||!str_starts_with($value['path'],'/'))return null;
        if(array_key_exists('props',$value)){$props=$value['props'];if($props instanceof \stdClass)$props=get_object_vars($props);elseif(!is_array($props)||array_is_list($props))return null;if(count($props)>20)return null;foreach($props as $k=>$v)if(mb_strlen((string)$k)>64||!is_bool($v)&&!is_int($v)&&!is_float($v)&&!is_string($v)||is_string($v)&&mb_strlen($v)>2048||is_float($v)&&!is_finite($v))return null;$value['props']=(object)$props;}
        foreach(['visible_ms','interval_start','interval_end','replay_seq'] as $k)if(isset($value[$k])&&!is_int($value[$k]))return null;
        if(isset($value['visible_ms'])&&($value['visible_ms']<0||$value['visible_ms']>86400000)||isset($value['replay_seq'])&&$value['replay_seq']<0)return null;
        if(isset($value['interval_start'],$value['interval_end'])&&($value['interval_end']<$value['interval_start']||($value['visible_ms']??0)>$value['interval_end']-$value['interval_start']))return null;
        if(isset($value['device_pixel_ratio'])&&(!is_numeric($value['device_pixel_ratio'])||$value['device_pixel_ratio']<.1||$value['device_pixel_ratio']>16))return null;
        if(isset($value['ad_click_source'])&&!in_array($value['ad_click_source'],['google','meta','both'],true))return null;
        if(isset($value['vitals'])){if(!is_array($value['vitals']))return null;foreach($value['vitals'] as $k=>$v)if(!in_array($k,['lcp','inp','cls','fcp','ttfb'],true)||!is_numeric($v)||!is_finite((float)$v)||$v<0)return null;}
        if(isset($value['replay'])&&(!is_array($value['replay'])||count($value['replay'])>500))return null;
        if(isset($value['heatmap'])){$p=$value['heatmap'];if(!is_array($p)||!in_array($p['kind']??'', ['click','scroll'],true))return null;foreach(['x','y'] as $k)if(!is_numeric($p[$k]??null)||$p[$k]<0||$p[$k]>1)return null;foreach(['width','height'] as $k)if(!is_numeric($p[$k]??null)||$p[$k]<1||$p[$k]>20000)return null;}
        $required=['event'=>['event_name'],'identify'=>['user_id'],'revenue'=>['revenue','currency','order_id'],'heartbeat'=>['visible_ms'],'vitals'=>['vitals'],'replay'=>['replay'],'heatmap'=>['heatmap']];foreach($required[$value['type']]??[] as $k)if(!isset($value[$k])||$value[$k]==='')return null;
        if(isset($value['revenue'])){try{$value['revenue']=self::decimal($value['revenue']);}catch(\Throwable){return null;}if((float)$value['revenue']>1e12)return null;}
        if(isset($value['currency'])&&!preg_match('/^[A-Z]{3}$/D',$value['currency']))return null;
        $keys=array_merge(array_keys($limits),['event_id','type','ts','visitor_id','page_id','props','visible_ms','interval_start','interval_end','replay_seq','vitals','revenue','currency','device_pixel_ratio','ad_click_source','replay','heatmap']);return array_intersect_key($value,array_flip($keys));
    }
    public static function origin(array $site,string $origin):bool
    {
        $u=parse_url($origin);if(!$u||!isset($u['scheme'],$u['host'])||isset($u['user'])||isset($u['pass'])||!in_array($u['scheme'],['http','https'],true))return false;
        $host=strtolower($u['host']);$authority=$host.(isset($u['port'])?':'.$u['port']:'');if($authority===strtolower($site['domain'])||$host===strtolower($site['domain']))return true;
        return $u['scheme']==='https'&&!isset($u['port'])&&in_array($host,$site['config']['allowed_hosts']??[],true);
    }
    public static function cidr(string $ip,string $cidr):bool
    {
        [$net,$mask]=array_pad(explode('/',$cidr,2),2,null);$a=@inet_pton($ip);$b=@inet_pton($net);if($a===false||$b===false||strlen($a)!==strlen($b))return false;$bits=$mask===null?strlen($a)*8:(int)$mask;if($bits<0||$bits>strlen($a)*8)return false;$bytes=intdiv($bits,8);return substr($a,0,$bytes)===substr($b,0,$bytes)&&($bits%8===0||((ord($a[$bytes])^ord($b[$bytes]))&(255<<(8-$bits%8)))===0);
    }
    public static function dimensions(string $ua,array $event,array $config=[],array $geo=[]):array
    {
        $host=strtolower((string)(parse_url($event['referrer']??'',PHP_URL_HOST)??''));$medium=strtolower($event['utm_medium']??'');$match=fn($domain)=>$host===$domain||str_ends_with($host,'.'.$domain);
        $ai=array_merge(['chatgpt.com','openai.com','claude.ai','perplexity.ai','doubao.com','yiyan.baidu.com','metaso.cn','kimi.moonshot.cn','kimi.com'],$config['ai_referrer_hosts']??[]);
        $search=['google.com','google.cn','google.com.hk','google.co.uk','google.co.jp','google.de','google.fr','google.com.au','bing.com','baidu.com','sogou.com','so.com','duckduckgo.com','yahoo.com'];$social=['weixin.qq.com','wechat.com','weibo.com','facebook.com','twitter.com','x.com','t.co','zhihu.com','douyin.com','xiaohongshu.com'];
        $has=fn($list)=>count(array_filter($list,$match))>0;
        $channel=$medium==='email'?'email':((preg_match('/^(cpc|paid|ppc|paidsearch|paid_social)$/',$medium)||!empty($event['ad_click_source']))?'paid':($has($ai)?'ai':($has($search)?'search':($has($social)?'social':($host!==''?'referral':'direct')))));
        foreach($config['channel_rules']??[] as $rule){if(isset($rule['referrer_host'])&& !($host===$rule['referrer_host']||($rule['include_subdomains']??false)&&str_ends_with($host,'.'.$rule['referrer_host'])))continue;if(isset($rule['utm_medium'])&&$rule['utm_medium']!==($event['utm_medium']??null)||isset($rule['utm_source'])&&$rule['utm_source']!==($event['utm_source']??null))continue;$channel=$rule['channel'];break;}
        $browser='unknown';foreach(['Edg/'=>'Edge','OPR/'=>'Opera','Firefox/'=>'Firefox','Chrome/'=>'Chrome','Safari/'=>'Safari'] as $token=>$name)if(str_contains($ua,$token)){$browser=$name;break;}
        $os='unknown';foreach(['Windows'=>'Windows','Android'=>'Android','iPhone'=>'iOS','iPad'=>'iOS','Mac OS'=>'Mac OS','Linux'=>'Linux'] as $token=>$name)if(str_contains($ua,$token)){$os=$name;break;}
        $screen=$event['screen']??'unknown';$size=0;if(preg_match('/^(\d+)x(\d+)$/D',$screen,$m)&&min((int)$m[1],(int)$m[2])>0&&max((int)$m[1],(int)$m[2])<=32768)$size=min((int)$m[1],(int)$m[2]);else $screen='unknown';
        $device=str_contains($ua,'iPad')||str_contains($ua,'Tablet')?'tablet':(str_contains($ua,'Mobile')||str_contains($ua,'iPhone')?($size>=600?'tablet':'mobile'):($browser!=='unknown'||$os!=='unknown'?($size&&$size<600?'mobile':($size&&$size<1024?'tablet':'desktop')):'unknown'));
        $out=array_merge(['country'=>'unknown','region'=>'unknown','city'=>'unknown'],$geo,['device'=>$device,'browser'=>$browser,'os'=>$os,'screen'=>$screen,'device_pixel_ratio'=>$event['device_pixel_ratio']??null,'language'=>$event['language']??'unknown','channel'=>$channel,'referrer'=>$host,'keyword'=>'','ad_click_source'=>$event['ad_click_source']??'']);
        if($channel==='search'){parse_str((string)(parse_url($event['referrer']??'',PHP_URL_QUERY)??''),$query);$q=$query[$match('baidu.com')?'wd':($match('sogou.com')?'query':'q')]??'';if(is_string($q)&&!preg_match('/@|\b(?:\d{1,3}\.){3}\d{1,3}\b|\d{7,}/',$q))$out['keyword']=mb_substr($q,0,128);}
        foreach(['source','medium','campaign','term','content'] as $k)$out['utm_'.$k]=$event['utm_'.$k]??'';return $out;
    }
    /** The PHP distribution carries the exact standard-edition library and license notice. */
    public static function botRules():array
    {
        $path=dirname(__DIR__).'/resources/bot-rules.json';
        if(!is_file($path))throw new \RuntimeException('bot_rules_unavailable');
        $library=json_decode((string)file_get_contents($path),true,32,JSON_THROW_ON_ERROR);
        if(!is_array($library)||!is_int($library['version']??null)||$library['version']<1||!is_array($library['rules']??null)||!count($library['rules'])||count($library['rules'])>200)throw new \RuntimeException('bot_rules_invalid');
        $seen=[];foreach($library['rules'] as &$rule){if(!is_array($rule)||!is_string($rule['id']??null)||$rule['id']===''||strlen($rule['id'])>64||isset($seen[$rule['id']])||!in_array($rule['category']??null,['ai','bot'],true)||!is_array($rule['tokens']??null)||!count($rule['tokens'])||count($rule['tokens'])>50)throw new \RuntimeException('bot_rules_invalid');$seen[$rule['id']]=true;foreach($rule['tokens'] as &$token){if(!is_string($token)||strlen($token)<3||strlen($token)>128)throw new \RuntimeException('bot_rules_invalid');$token=strtolower($token);}unset($token);}unset($rule);return $library;
    }
    public static function register(App $app,Router $router):void
    {
        $router->add('OPTIONS','/api/collect',function(Http $http){return Http::json(null,204,['Access-Control-Allow-Origin'=>$http->header('origin')??'*','Access-Control-Allow-Methods'=>'POST, OPTIONS','Access-Control-Allow-Headers'=>'Content-Type, Authorization, X-Baize-Signature','Vary'=>'Origin']);});
        $router->add('POST','/api/collect',fn(Http $http)=>self::ingest($app,$http));
        $base='/api/v1/sites/:siteId';
        $router->add('GET',$base.'/jobs',function(Http $http)use($app){$site=$http->params['siteId'];$app->auth->authorize($http,$site,'admin');return $app->db->transaction(function()use($app,$site){$app->db->lock('site:'.$site);$jobs=$app->store->list('queue_jobs',$site);$counts=[];$rows=[];foreach($jobs as $job){$counts[$job['status']]=($counts[$job['status']]??0)+1;unset($job['lease_token'],$job['payload']);$rows[]=$job;}return ['rawRetirement'=>['status'=>'mysql_transactional_retention','journal'=>'independent_verified_deletion_journal'],'aggregation'=>$app->store->get('aggregation_state',$site),'outbox'=>array_map(fn($status,$count)=>['status'=>$status,'count'=>$count],array_keys($counts),array_values($counts)),'jobs'=>$rows,'delivery'=>'at_least_once_with_lease_token_and_revision_fencing'];});});
        $router->add('POST',$base.'/jobs/replay',function(Http $http)use($app){$site=$http->params['siteId'];$user=$app->auth->authorize($http,$site,'admin');$count=$app->db->transaction(function()use($app,$site){$app->db->lock('site:'.$site);$n=Queue::replay($app,$site);$state=$app->store->get('aggregation_state',$site)??['id'=>$site,'site_id'=>$site,'generation'=>0];$state['generation']=($state['generation']??0)+1;$state['attempts']=0;$state['last_error']=$state['dead_letter_at']=$state['lease_until']=null;$app->store->put('aggregation_state',$site,$state,$site);Queue::enqueue($app,'aggregate',$site,[],'aggregate:'.$site);return $n;});$app->audit($user['id'],$site,'worker.replay',['jobs'=>$count]);return ['queued'=>true,'replayed'=>$count];});
        $router->add('GET',$base.'/intake-status',function(Http $http)use($app){$site=$http->params['siteId'];$app->auth->authorize($http,$site);$observed=$app->store->get('site_intake_observations',$site);$state=$app->store->get('aggregation_state',$site);$statistics=null;$failed=false;try{$stats=Analytics::stats($app,$site,$http->query);$statistics=['coverage'=>$stats['coverage'],'rangeStatus'=>$stats['rangeStatus'],'source'=>$stats['storage']];}catch(\Throwable){$failed=true;}$caught=$observed&&$state&&($state['processed_generation']??-1)>=($observed['last_generation']??0);return ['stage'=>!$observed?'not_observed':($failed?'statistics_unavailable':($caught?($statistics['coverage']===1?'statistics_available':'statistics_unavailable'):'aggregation_pending')),'observation'=>$observed,'aggregation'=>$state,'statistics'=>$statistics,'requestedRange'=>['from'=>$http->query['from']??EventPrivacy::iso(microtime(true)*1000-7*86400000),'to'=>$http->query['to']??Store::now()],'filters'=>array_intersect_key($http->query,array_flip(['path','channel','utm_source','utm_medium','utm_campaign','utm_term','utm_content'])),'snippetVerified'=>false,'limitations'=>['receiver_observation_not_browser_installation_proof','filtered_empty_does_not_mean_tracker_failure','daily_salt_and_retention_limits_apply']];});
        $router->add('GET',$base.'/bot-observations',function(Http $http)use($app){$site=$http->params['siteId'];$app->auth->authorize($http,$site);$settings=$app->store->get('sites',$site);$from=$http->query['from']??EventPrivacy::day(Store::now(),$settings['timezone']??'UTC');$to=$http->query['to']??$from;if(!is_string($from)||!is_string($to)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$from)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$to)||strtotime($from)===false||strtotime($to)===false||$to<$from||strtotime($to)-strtotime($from)>30*86400)Http::error(400,'invalid_bot_window');$groups=[];foreach($app->store->list('bot_observations',$site) as $row){$day=$row['day']??EventPrivacy::day($row['ts'],$settings['timezone']??'UTC');if($day<$from||$day>$to)continue;$reason=$row['reason']??($row['rule_id']==='request_burst'?'request_burst':'ua');$key=$row['category'].':'.$reason.':'.$row['rule_id'].':'.($row['rule_version']??1);$groups[$key]??=['category'=>$row['category'],'reason'=>$reason,'rule_id'=>$row['rule_id'],'rule_version'=>$row['rule_version']??1,'filtered_requests'=>0,'declared_events'=>0];$groups[$key]['filtered_requests']+=$row['requests']??$row['filtered_requests']??0;$groups[$key]['declared_events']+=$row['events']??$row['declared_events']??0;}usort($groups,fn($a,$b)=>$b['filtered_requests']<=>$a['filtered_requests']);$rows=array_slice($groups,0,200);foreach($rows as &$row){$row['filtered_requests']=(string)$row['filtered_requests'];$row['declared_events']=(string)$row['declared_events'];}unset($row);return ['from'=>$from,'to'=>$to,'rows'=>$rows,'truncated'=>count($groups)>200,'legacy_unknown'=>[],'semantics'=>'filtered_requests_and_unvalidated_declared_events','limits'=>['maxDays'=>31,'maxGroups'=>200],'excludes'=>['raw_ip','user_agent','visitor','payload']];});
    }
    public static function ingest(App $app,Http $http):mixed
    {
        $body=$http->body;if(($body['protocol_version']??null)!==1)return Http::json(['error'=>'unsupported_protocol_version','supported'=>[1]],400);
        if(!is_string($body['site_id']??null)||strlen($body['site_id'])<1||strlen($body['site_id'])>128||!is_string($body['sdk']??null)||strlen($body['sdk'])>64||!is_int($body['sent_at']??null)||!is_array($body['events']??null)||!array_is_list($body['events'])||count($body['events'])<1||count($body['events'])>50)Http::error(400,'invalid_envelope');
        $siteId=$body['site_id'];$site=$app->store->get('sites',$siteId);if(!$site)Http::error(404,'site_missing');
        $origin=$http->header('origin');if($origin){if(!self::origin($site,$origin))Http::error(403,'invalid_origin');header('Access-Control-Allow-Origin: '.$origin);header('Vary: Origin');}
        $ip=(string)($_SERVER['REMOTE_ADDR']??'127.0.0.1');$ua=substr($http->header('user-agent')??'',0,8192);
        if($http->header('dnt')==='1'||$http->header('sec-gpc')==='1')return Http::json(null,204);
        $now=(int)floor(microtime(true)*1000);$result=$app->db->transaction(function()use($app,$http,$body,$siteId,$ip,$ua,$origin,$now){
            $app->db->lock('site:'.$siteId);$store=$app->store;$site=$store->get('sites',$siteId);if(!$site)Http::error(404,'site_missing');$config=$site['config']??[];
            if($origin&&!self::origin($site,$origin))Http::error(403,'invalid_origin');foreach($config['excluded_ips']??[] as $cidr)if(self::cidr($ip,$cidr))return null;
            $salt=(string)$site['salt_secret'];$rateId=$siteId.':'.EventPrivacy::hash($salt,'rate',$ip);$rate=$store->get('intake_rate',$rateId)??['id'=>$rateId,'requests'=>[],'window'=>$now,'count'=>0];
            if($now-$rate['window']>=60000){$rate['window']=$now;$rate['count']=0;}$rate['count']++;$rate['requests']=array_values(array_filter($rate['requests'],fn($t)=>$t>$now-1000));$rate['requests'][]=$now;$rate['requests']=array_slice($rate['requests'],-21);$rate['expires_at']=EventPrivacy::iso($now+60000);$store->put('intake_rate',$rateId,$rate,$siteId);
            if($rate['count']>100)return ['limited'=>true];
            $bot=null;$library=self::botRules();$rules=$library['rules'];
            foreach($rules as $rule){foreach($rule['tokens'] as $token)if(str_contains(strtolower($ua),$token)){$bot=$rule;break;}if($bot)break;}
            if($bot||count($rate['requests'])>20){$id=$siteId.':'.gmdate('Y-m-d\TH:00:00\Z',(int)floor($now/1000)).':'.($bot['id']??'request_burst').':'.$library['version'];$b=$store->get('bot_observations',$id)??['id'=>$id,'site_id'=>$siteId,'ts'=>EventPrivacy::iso($now),'day'=>EventPrivacy::day($now,$site['timezone']??'UTC'),'category'=>$bot['category']??'bot','reason'=>$bot?'ua':'request_burst','rule_id'=>$bot['id']??'request_burst','rule_version'=>$library['version'],'requests'=>0,'events'=>0];$b['requests']++;$b['events']+=count($body['events']);$store->put('bot_observations',$id,$b,$siteId);return null;}
            if($authorization=$http->header('authorization')){$token=preg_replace('/^Bearer /','',$authorization);if(!isset($config['write_key_hash'])||!hash_equals($config['write_key_hash'],hash('sha256',$token)))Http::error(401,'invalid_write_key');if(!class_exists(\Collator::class))Http::error(503,'signature_runtime_unavailable','服务端签名采集需要 PHP intl 扩展，请在 1Panel PHP 环境启用后重试');$signed=$http->rawBody!==''?json_decode($http->rawBody,false,64,JSON_THROW_ON_ERROR):(object)$body;$signature=$http->header('x-baize-signature')??'';$valid=preg_match('/^[a-f0-9]{64}$/iD',$signature)&&hash_equals(hash_hmac('sha256',self::canonical($signed),$token),strtolower($signature));if(!$valid)$valid=preg_match('/^[a-f0-9]{64}$/iD',$signature)&&hash_equals(hash_hmac('sha256',self::canonical($signed,true),$token),strtolower($signature));if(!$valid)Http::error(401,'invalid_signature');}
            $accepted=0;$duplicates=0;$rejected=[];$changed=false;$lastAcceptedTime=0;$cursor=$store->get('realtime_cursor',$siteId)??['id'=>$siteId,'site_id'=>$siteId,'value'=>0];$geo=class_exists(GeoIP::class)?GeoIP::lookup($app,$ip):[];
            foreach($body['events'] as $index=>$raw){$event=self::validate($raw);$reason=null;if(!$event)$reason='invalid_event';elseif($event['ts']>$now+86400000)$reason='future_event';elseif($event['ts']<$now-(int)($site['retention_days']??365)*86400000)$reason='outside_retention';elseif(($site['privacy_mode']??'standard')==='daily_salt'&&$event['type']==='identify')$reason='identify_unsupported_in_daily_salt';elseif(in_array($event['type'],['replay','heatmap'],true)&&($config[$event['type']]??false)!==true)$reason='feature_not_enabled';
                if($reason){$rejected[]=['index'=>$index,'event_id'=>is_array($raw)?($raw['event_id']??null):null,'reason'=>$reason];continue;}
                $daily=($site['privacy_mode']??'standard')==='daily_salt';$day=EventPrivacy::day($event['ts'],$site['timezone']??'UTC');$visitor=$daily?EventPrivacy::hash($salt,$day,$ip,$ua):($event['visitor_id']??Store::uuid());$claimed=!$daily&&isset($event['user_id'])?EventPrivacy::hash($salt,'identity',$event['user_id']):null;
                $identity=EventPrivacy::identity($store,$siteId,$visitor,$event['ts'],$claimed,$event['type']==='identify');if(!$identity['allowed']){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>$identity['reason']];continue;}
                if($event['type']==='replay'&&(!EventPrivacy::replayMasked($event['replay'])||count(EventPrivacy::filterReplay($store,$siteId,$visitor,$event['replay']))!==count($event['replay']))){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>EventPrivacy::replayMasked($event['replay'])?'deleted_replay_frame':'unmasked_replay'];continue;}
                if($event['type']==='replay'&&count($event['replay'])){$times=array_column($event['replay'],'timestamp');if(min($times)<$now-min(30,(int)($site['retention_days']??365))*86400000||max($times)>$now+86400000){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>min($times)<$now-min(30,(int)($site['retention_days']??365))*86400000?'outside_replay_retention':'future_replay_frame'];continue;}}
                $hash=hash('sha256',self::canonical($event));$keyId=$siteId.':'.$event['event_id'];$existing=$store->get('event_keys',$keyId);
                if($existing){if(!hash_equals($existing['hash'],$hash))$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>'event_id_conflict'];else{$accepted++;$duplicates++;}continue;}
                $page=$daily?EventPrivacy::page($salt,$day,$event['page_id']):$event['page_id'];$receipt=['hash'=>$hash];$orderId=null;$replayId=null;
                if($event['type']==='replay'){
                    if(!EventPrivacy::replayMasked($event['replay'])){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>'unmasked_replay'];continue;}
                    $frames=EventPrivacy::filterReplay($store,$siteId,$visitor,$event['replay']);
                    // Never accept a mixed payload containing a deleted frame under a new key.
                    if(count($frames)!==count($event['replay'])){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>'deleted_replay_frame'];continue;}
                    $replayId=$siteId.':'.$visitor.':'.$page.':'.($event['replay_seq']??0);$previous=$store->get('replay_keys',$replayId);$replayHash=hash('sha256',self::canonical($frames));
                    if($previous){if(!hash_equals($previous['payload_hash'],$replayHash)){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>'replay_sequence_conflict'];continue;}$receipt['alias_of']=$previous['event_id'];$store->put('event_keys',$keyId,$receipt,$siteId);$accepted++;$duplicates++;continue;}
                }
                if($event['type']==='revenue'){$orderHash=EventPrivacy::hash($salt,$daily?'order:'.$day:'order',$event['order_id']);$orderId=$siteId.':'.$orderHash;$previous=$store->get('revenue_orders',$orderId);if($previous){if($previous['currency']!==$event['currency']||$previous['amount']!==$event['revenue']){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>'order_id_conflict'];continue;}$receipt['alias_of']=$previous['event_id'];$store->put('event_keys',$keyId,$receipt,$siteId);$accepted++;$duplicates++;continue;}$event['order_id']=$orderHash;}
                if($event['type']==='identify'&&$claimed){if(!EventPrivacy::bind($store,$siteId,$visitor,$claimed,$event['ts'])){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>'identity_time_conflict'];continue;}$identity=EventPrivacy::identity($store,$siteId,$visitor,$event['ts']);}
                $metadata=self::dimensions($ua,$event,$config,$geo);
                $event['visitor_id']=$visitor;$event['page_id']=$page;unset($event['user_id']);if(!$daily&&$identity['user_id'])$event['user_id']=$identity['user_id'];$event=EventPrivacy::clean($event,$ip,$daily);
                if($daily)$metadata=EventPrivacy::daily($metadata);else{$packed=@inet_pton($ip);if($packed!==false){$bytes=strlen($packed)===4?3:6;$metadata['ip_truncated']=inet_ntop(substr($packed,0,$bytes).str_repeat("\0",strlen($packed)-$bytes));}}
                $stored=['site_id'=>$siteId,'event_id'=>$event['event_id'],'visitor_id'=>$visitor,'page_id'=>$page,'ts'=>EventPrivacy::iso($event['ts']),'type'=>$event['type'],'path'=>$event['path'],'payload'=>$event,'dimensions'=>$metadata,'is_bot'=>false];
                if(EventPrivacy::deleted($store,$siteId,$stored)){$rejected[]=['index'=>$index,'event_id'=>$event['event_id'],'reason'=>'deleted_visitor'];continue;}
                if($cursor['value']>=PHP_INT_MAX)throw new \RuntimeException('realtime_cursor_exhausted');$cursor['value']++;$stored['cursor_id']=$cursor['value'];$stored['received_at']=Store::now();
                if($event['type']==='heatmap')Analytics::recordHeatmap($app,$stored);
                $store->put('event_keys',$keyId,$receipt,$siteId);$store->put('events',$keyId,$stored,$siteId);
                if($orderId)$store->put('revenue_orders',$orderId,['id'=>$orderId,'site_id'=>$siteId,'order_hash'=>$orderHash,'visitor_id'=>$visitor,'event_id'=>$event['event_id'],'ts'=>$stored['ts'],'currency'=>$event['currency'],'amount'=>$event['revenue'],'privacy_mode'=>$site['privacy_mode'],'order_day'=>$daily?$day:null],$siteId);
                if($replayId){$replay=['id'=>$replayId,'site_id'=>$siteId,'event_id'=>$event['event_id'],'visitor_id'=>$visitor,'page_id'=>$page,'session_id'=>$visitor.':'.$page,'seq'=>$event['replay_seq']??0,'path'=>$event['path'],'ts'=>$stored['ts'],'payload'=>$event['replay'],'started_at'=>count($event['replay'])?EventPrivacy::iso(min(array_column($event['replay'],'timestamp'))):$stored['ts'],'ended_at'=>count($event['replay'])?EventPrivacy::iso(max(array_column($event['replay'],'timestamp'))):$stored['ts']];$store->put('replays',$replayId,$replay,$siteId);$store->put('replay_keys',$replayId,['event_id'=>$event['event_id'],'payload_hash'=>$replayHash],$siteId);}
                if($event['type']==='pageview'){$firstId=$siteId.':'.$visitor;$first=$store->get('visitor_first_seen',$firstId);if(!$first||EventPrivacy::millis($first['first_ts'])>$event['ts'])$store->put('visitor_first_seen',$firstId,['id'=>$firstId,'site_id'=>$siteId,'visitor_id'=>$visitor,'first_ts'=>$stored['ts'],'first_date'=>$day],$siteId);}
                if($event['type']==='event'&&($config['experiments']??false)&&!$daily)foreach($store->list('experiment_assignments',$siteId) as $assignment){if($assignment['visitor_id']!==$visitor||isset($assignment['assigned_at'])&&EventPrivacy::millis($assignment['assigned_at'])>$event['ts'])continue;$experiment=$store->get('experiments',$assignment['experiment_id']);if(!$experiment||!($experiment['enabled']??true)||$experiment['goal']!==$event['event_name'])continue;$id=$experiment['id'].':'.$event['event_id'];$store->put('experiment_contributions',$id,['id'=>$id,'site_id'=>$siteId,'experiment_id'=>$experiment['id'],'visitor_id'=>$visitor,'event_id'=>$event['event_id'],'variant'=>$assignment['variant'],'ts'=>$stored['ts']],$siteId);}
                $accepted++;$changed=true;$lastAcceptedTime=max($lastAcceptedTime,$event['ts']);
            }
            if($changed){$received=Store::now();$store->put('realtime_cursor',$siteId,$cursor,$siteId);$site['last_event_at']=$received;$store->put('sites',$siteId,$site,$siteId);$state=$store->get('aggregation_state',$siteId)??['id'=>$siteId,'site_id'=>$siteId,'generation'=>0,'processed_generation'=>0];$state['generation']=($state['generation']??0)+1;$store->put('aggregation_state',$siteId,$state,$siteId);$observation=$store->get('site_intake_observations',$siteId)??['id'=>$siteId,'site_id'=>$siteId,'first_received_at'=>$received,'accepted_events'=>0];$observation['last_received_at']=$received;$observation['last_event_time']=EventPrivacy::iso(max(isset($observation['last_event_time'])?EventPrivacy::millis($observation['last_event_time']):0,$lastAcceptedTime));$observation['last_generation']=$state['generation'];$observation['accepted_events']+=$accepted;$store->put('site_intake_observations',$siteId,$observation,$siteId);Queue::enqueue($app,'aggregate',$siteId,[], 'aggregate:'.$siteId);}
            return ['accepted'=>$accepted,'duplicates'=>$duplicates,'rejected'=>$rejected,'clock_skew'=>abs($now-$body['sent_at'])>86400000];
        });
        if(isset($result['limited'])){header('Retry-After: 60');Http::error(429,'rate_limited');}
        return Http::json($result,$result===null?204:202);
    }
}
