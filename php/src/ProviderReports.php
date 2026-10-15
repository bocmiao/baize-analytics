<?php
declare(strict_types=1);
namespace Baize;

/** Provider reports retain provider deduplication; SEO findings describe fetched HTML only. */
final class ProviderReports
{
    private const METRICS=['screenPageViews','totalUsers','sessions'];
    private const REPORTS=['sourceDays'=>['date','sessionSource'],'days'=>['date'],'weeks'=>['isoYearIsoWeek'],'period'=>[],'sources'=>['sessionSource']];
    private const GOOGLE_DOC='https://developers.google.com/search/docs/';
    private const MAX_ROWS=100000;

    private static function invalid(string $code='external_response_invalid'):never {Http::error(502,$code);}
    private static function request(string $url,array $options=[]):array
    {
        $r=External::providerRequest($url,$options);
        if(!is_int($r['status']??null)||!is_string($r['text']??null))self::invalid();
        return $r+['headers'=>[]];
    }
    private static function json(string $url,array $options=[]):array
    {
        $r=self::request($url,$options);if($r['status']!==200)self::invalid('external_provider_failed');
        try{$v=json_decode($r['text'],true,128,JSON_THROW_ON_ERROR);}catch(\Throwable){self::invalid();}
        if(!is_array($v)||array_is_list($v)&&$v!==[])self::invalid();return $v;
    }
    public static function range(array $input):array
    {
        foreach(['start','end'] as $key){$value=$input[$key]??null;if(!is_string($value)||!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$value,$m)||!checkdate((int)$m[2],(int)$m[3],(int)$m[1]))Http::error(400,'aggregate_range_invalid');}
        $days=(strtotime($input['end'].' UTC')-strtotime($input['start'].' UTC'))/86400;
        if($days<0||$days>3660)Http::error(400,'aggregate_range_invalid');return ['start'=>$input['start'],'end'=>$input['end']];
    }
    private static function countMetric(mixed $value):int
    {
        if(!is_string($value)||!preg_match('/^\d+$/D',$value))self::invalid();$normalized=ltrim($value,'0');if($normalized==='')return 0;
        if(strlen($normalized)>16||strlen($normalized)===16&&strcmp($normalized,'9007199254740991')>0)self::invalid();return (int)$normalized;
    }
    private static function reportMetadata(mixed $input):array
    {
        if(!is_array($input)||($input!==[]&&array_is_list($input)))self::invalid();$out=[];
        if(isset($input['timeZone'])){if(!is_string($input['timeZone'])||strlen($input['timeZone'])>100)self::invalid();try{new \DateTimeZone($input['timeZone']);}catch(\Throwable){self::invalid();}$out['timeZone']=$input['timeZone'];}
        foreach(['subjectToThresholding','dataLossFromOtherRow'] as $key)if(array_key_exists($key,$input)){if(!is_bool($input[$key]))self::invalid();$out[$key]=$input[$key];}
        if(isset($input['samplingMetadatas'])){if(!is_array($input['samplingMetadatas'])||!array_is_list($input['samplingMetadatas'])||count($input['samplingMetadatas'])>10)self::invalid();$out['samplingMetadatas']=[];foreach($input['samplingMetadatas'] as $sample){if(!is_array($sample))self::invalid();$v=[];foreach(['samplesReadCount','samplingSpaceSize'] as $key){$x=$sample[$key]??null;if(!is_string($x)||!preg_match('/^\d{1,30}$/D',$x))self::invalid();$v[$key]=$x;}$out['samplingMetadatas'][]=$v;}}
        return $out;
    }
    private static function unsignedLess(string $a,string $b):bool {$a=ltrim($a,'0')?:'0';$b=ltrim($b,'0')?:'0';return strlen($a)<strlen($b)||strlen($a)===strlen($b)&&strcmp($a,$b)<0;}
    private static function validateDimension(string $dimension,string $value,array $range):void
    {
        if(mb_strlen($value,'UTF-8')>512)self::invalid();
        if($dimension==='date'){$day=substr($value,0,4).'-'.substr($value,4,2).'-'.substr($value,6,2);if(!preg_match('/^\d{8}$/D',$value)||!checkdate((int)substr($value,4,2),(int)substr($value,6,2),(int)substr($value,0,4))||$day<$range['start']||$day>$range['end'])self::invalid();}
        if($dimension==='isoYearIsoWeek'){
            if(!preg_match('/^(\d{4})(\d{2})$/D',$value,$m)||(int)$m[1]<1900||(int)$m[2]<1||(int)$m[2]>53)self::invalid();
            $first=(new \DateTimeImmutable('now',new \DateTimeZone('UTC')))->setISODate((int)$m[1],(int)$m[2],1)->setTime(0,0);$last=$first->modify('+6 days');
            if($first->format('oW')!==$value||$last->format('Y-m-d')<$range['start']||$first->format('Y-m-d')>$range['end'])self::invalid();
        }
    }
    private static function gaReport(string $token,string $property,array $range,array $dimensions):array
    {
        $rows=[];$seen=[];$metadata=[];$rowCount=null;$offset=0;
        while(true){
            $body=['dateRanges'=>[['startDate'=>$range['start'],'endDate'=>$range['end']]],'dimensions'=>array_map(fn($name)=>['name'=>$name],$dimensions),'metrics'=>array_map(fn($name)=>['name'=>$name],self::METRICS),'offset'=>(string)$offset,'limit'=>'10000','orderBys'=>array_map(fn($name)=>['dimension'=>['dimensionName'=>$name]],$dimensions)];
            $v=self::json('https://analyticsdata.googleapis.com/v1beta/properties/'.$property.':runReport',['method'=>'POST','headers'=>['Authorization'=>'Bearer '.$token,'Content-Type'=>'application/json'],'body'=>Operations::json($body),'maxBytes'=>5000000]);
            $batch=$v['rows']??[];if(!is_array($batch)||!array_is_list($batch)||count($batch)>10000)self::invalid();
            if(array_key_exists('rowCount',$v)){if(!is_int($v['rowCount'])||$v['rowCount']<0)self::invalid();if($v['rowCount']>self::MAX_ROWS)Http::error(413,'external_response_too_large');if($rowCount!==null&&$rowCount!==$v['rowCount'])self::invalid();$rowCount=$v['rowCount'];}
            foreach(['dimensionHeaders'=>$dimensions,'metricHeaders'=>self::METRICS] as $key=>$expected)if(isset($v[$key])){if(!is_array($v[$key])||!array_is_list($v[$key])||array_column($v[$key],'name')!==$expected||count($v[$key])!==count($expected))self::invalid();}
            if(isset($v['metadata']))$metadata[]=self::reportMetadata($v['metadata']);
            foreach($batch as $r){
                if(!is_array($r))self::invalid();$r['dimensionValues']??=[];if(!is_array($r['dimensionValues'])||!array_is_list($r['dimensionValues'])||count($r['dimensionValues'])!==count($dimensions)||!is_array($r['metricValues']??null)||!array_is_list($r['metricValues'])||count($r['metricValues'])!==3)self::invalid();
                $values=[];foreach($dimensions as $i=>$name){$value=$r['dimensionValues'][$i]['value']??null;if(!is_string($value))self::invalid();self::validateDimension($name,$value,$range);$values[]=$value;}
                $key=Operations::json($values);if(isset($seen[$key]))self::invalid();$seen[$key]=true;
                $rows[]=['dimensions'=>$values,'pv'=>self::countMetric($r['metricValues'][0]['value']??null),'totalUsers'=>self::countMetric($r['metricValues'][1]['value']??null),'sessions'=>self::countMetric($r['metricValues'][2]['value']??null)];
            }
            if(count($rows)>self::MAX_ROWS)Http::error(413,'external_response_too_large');$offset+=count($batch);
            if($rowCount!==null){if(count($rows)>$rowCount||!$batch&&count($rows)<$rowCount)self::invalid();if(count($rows)===$rowCount)break;}
            elseif(count($batch)<10000)break;
        }
        if(!$dimensions&&count($rows)>1)self::invalid();return ['rows'=>$rows,'metadata'=>$metadata,'rowCount'=>$rowCount];
    }
    public static function importGA4(App $a,string $site,array $input):array
    {
        $range=self::range($input);$c=External::connection($a,$site,'google');$property=$c['settings']['gaProperty']??null;
        if(!is_string($property)||!preg_match('/^\d{1,30}$/D',$property))Http::error(400,'external_config_invalid');
        try{$secret=json_decode($c['secret'],true,32,JSON_THROW_ON_ERROR);}catch(\Throwable){Http::error(409,'google_authorization_required');}
        if(!is_string($secret['refreshToken']??null)||$secret['refreshToken']===''||!is_string($secret['clientSecret']??null)||!is_string($c['settings']['clientId']??null))Http::error(409,'google_authorization_required');
        $token=self::json('https://oauth2.googleapis.com/token',['method'=>'POST','headers'=>['Content-Type'=>'application/x-www-form-urlencoded'],'body'=>http_build_query(['client_id'=>$c['settings']['clientId'],'client_secret'=>$secret['clientSecret'],'refresh_token'=>$secret['refreshToken'],'grant_type'=>'refresh_token'])]);
        if(!is_string($token['access_token']??null)||$token['access_token']==='')self::invalid();
        $reports=[];$zones=[];$limited=false;$allMetadata=true;
        foreach(self::REPORTS as $key=>$dimensions){$reports[$key]=self::gaReport($token['access_token'],$property,$range,$dimensions);if(!$reports[$key]['metadata'])$allMetadata=false;foreach($reports[$key]['metadata'] as $m){if(isset($m['timeZone']))$zones[$m['timeZone']]=true;if(($m['subjectToThresholding']??false)||($m['dataLossFromOtherRow']??false))$limited=true;foreach($m['samplingMetadatas']??[] as $sample)if(self::unsignedLess($sample['samplesReadCount'],$sample['samplingSpaceSize']))$limited=true;}}
        if(count($zones)>1)self::invalid();$timezone=array_key_first($zones);$quality=$limited?'limited':($allMetadata?'provider-reported':'unknown');
        $window=['requestedCoverage'=>$range,'userMetric'=>'totalUsers','source'=>'GA4 Data API','reports'=>$reports,'propertyTimezone'=>$timezone,'quality'=>$quality];
        $a->db->transaction(function()use($a,$site,$c,$property,$range,$window,$timezone){
            $a->db->lock('site:'.$site);$current=$a->store->get('external_connections',$site.':google');
            if(!$current||($current['revision']??null)!==($c['revision']??null)||($current['settings']['gaProperty']??null)!==$property)Http::error(409,'external_config_changed');
            foreach($a->db->all('SELECT id,body FROM documents WHERE kind=? AND site_id=?',['ga_import',$site]) as $old){$v=json_decode($old['body'],true,512,JSON_THROW_ON_ERROR);if(($v['day']??'')>=$range['start']&&($v['day']??'')<=$range['end'])$a->store->delete('ga_import',$old['id']);}
            foreach($window['reports']['sourceDays']['rows'] as $r){$d=$r['dimensions'][0];$day=substr($d,0,4).'-'.substr($d,4,2).'-'.substr($d,6,2);$source=$r['dimensions'][1];$id=hash('sha256',$site."\0".$day."\0".$source);$a->store->put('ga_import',$id,['id'=>$id,'site_id'=>$site,'day'=>$day,'source'=>$source,'pv'=>$r['pv'],'uv'=>$r['totalUsers'],'sessions'=>$r['sessions']],$site);}
            $id=hash('sha256',$site.$range['start'].$range['end']);$a->store->put('ga_import_windows',$id,['id'=>$id,'site_id'=>$site,'start_day'=>$range['start'],'end_day'=>$range['end'],'property_id'=>$property,'property_timezone'=>$timezone,'data'=>$window,'metadata'=>['propertyTimezone'=>$timezone,'quality'=>$window['quality'],'userMetric'=>'totalUsers','provider'=>'GA4 Data API'],'imported_at'=>Store::now()],$site);
        });
        return ['rows'=>count($reports['sourceDays']['rows']),'source'=>'GA4 Data API','coverage'=>$range,'quality'=>$quality,'propertyTimezone'=>$timezone,'scope'=>'aggregate-only','nativeMerged'=>false,'missing'=>['事件明细','访客身份','漏斗历史']];
    }
    public static function ga4Window(App $a,string $site,array $input):array
    {
        $range=self::range($input);foreach($a->store->list('ga_import_windows',$site) as $v)if(($v['start_day']??null)===$range['start']&&($v['end_day']??null)===$range['end']&&isset($v['data']['reports']['period']))return ['status'=>'saved-provider-window','data'=>$v['data'],'property_id'=>$v['property_id'],'property_timezone'=>$v['property_timezone']??null,'imported_at'=>$v['imported_at'],'scope'=>'aggregate-only','nativeMerged'=>false];
        return ['status'=>'unsupported','reason'=>'exact-provider-window-not-imported','requestedCoverage'=>$range,'nativeMerged'=>false];
    }

    /** Resolve relative document links without extending an authorized origin. */
    public static function resolveUrl(string $base,string $reference):?string
    {
        $reference=trim(html_entity_decode($reference,ENT_QUOTES|ENT_HTML5,'UTF-8'));if($reference===''||preg_match('/[\x00-\x20\x7f\\\\]/',$reference))return null;
        $b=parse_url($base);if(!$b||!isset($b['scheme'],$b['host']))return null;
        if(str_starts_with($reference,'//'))$reference=$b['scheme'].':'.$reference;
        $u=parse_url($reference);if($u===false)return null;if(isset($u['scheme'])&&!in_array(strtolower($u['scheme']),['https','http'],true)||isset($u['user'])||isset($u['pass']))return null;
        $scheme=strtolower($u['scheme']??$b['scheme']);$host=strtolower($u['host']??$b['host']);$port=$u['port']??(isset($u['host'])?null:($b['port']??null));
        $path=$u['path']??'';if(!isset($u['host'])&&!str_starts_with($path,'/'))$path=$path===''?($b['path']??'/'):substr($b['path']??'/',0,strrpos($b['path']??'/','/')+1).$path;
        $pieces=[];foreach(explode('/',$path?:'/') as $piece){if($piece==='..')array_pop($pieces);elseif($piece!=='.')$pieces[]=$piece;}$path=implode('/',$pieces);if(!str_starts_with($path,'/'))$path='/'.$path;
        $origin=$scheme.'://'.$host.($port!==null&&!(($scheme==='https'&&$port===443)||($scheme==='http'&&$port===80))?':'.$port:'');$query=array_key_exists('query',$u)?'?'.$u['query']:($reference[0]==='#'&&isset($b['query'])?'?'.$b['query']:'');return $origin.$path.$query;
    }
    private static function origin(string $url):string {$v=self::resolveUrl($url,'/');if($v===null)Http::error(400,'outbound_destination_blocked');return rtrim($v,'/');}
    public static function robotsAllowed(string $path,string $text):bool
    {
        $groups=[];$group=['agents'=>[],'rules'=>[]];
        foreach(preg_split('/\r?\n/',$text)?:[] as $raw){$line=trim(explode('#',$raw,2)[0]);$pair=explode(':',$line,2);if(count($pair)!==2)continue;$key=strtolower(trim($pair[0]));$value=trim($pair[1]);if($key==='user-agent'){if($group['rules']){$groups[]=$group;$group=['agents'=>[],'rules'=>[]];}$group['agents'][]=strtolower($value);}elseif(in_array($key,['allow','disallow'],true)&&$group['agents']&&$value!=='')$group['rules'][]=['allow'=>$key==='allow','value'=>$value];}
        if($group['agents'])$groups[]=$group;$specific=[];$longestAgent=0;
        foreach($groups as $g)foreach($g['agents'] as $agent)if($agent!==''&&$agent!=='*'&&str_starts_with('baizebot',$agent)){$length=strlen($agent);if($length>$longestAgent){$specific=[];$longestAgent=$length;}if($length===$longestAgent)$specific[]=$g;}
        $selected=$specific?:array_values(array_filter($groups,fn($g)=>in_array('*',$g['agents'],true)));$longest=-1;$allowed=true;
        $normalize=static fn($v)=>preg_replace_callback('/%([a-f0-9]{2})/i',static function($m){$c=chr(hexdec($m[1]));return preg_match('/[A-Za-z0-9_.~-]/',$c)?$c:'%'.strtoupper($m[1]);},$v);$path=$normalize($path);
        foreach($selected as $g)foreach($g['rules'] as $rule){$value=$normalize($rule['value']);$anchored=str_ends_with($value,'$');if($anchored)$value=substr($value,0,-1);$pattern=str_replace('\\*','.*',preg_quote($value,'~'));if(preg_match('~^'.$pattern.($anchored?'$':'').'~D',$path)){ $length=strlen(str_replace('*','',$value));if($length>$longest||$length===$longest&&$rule['allow']){$longest=$length;$allowed=$rule['allow'];}}}
        return $allowed;
    }
    public static function inspectSeo(string $url,string $html,int $status,array $headers=[],?string $checkedAt=null):array
    {
        if(!class_exists(\DOMDocument::class))Http::error(503,'seo_dom_extension_required');$checkedAt??=Store::now();$dom=new \DOMDocument();$prior=libxml_use_internal_errors(true);
        try{$dom->loadHTML('<?xml encoding="utf-8" ?>'.$html,LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);}finally{libxml_clear_errors();libxml_use_internal_errors($prior);}
        $xpath=new \DOMXPath($dom);$findings=[];$issues=[];$lower='ABCDEFGHIJKLMNOPQRSTUVWXYZ';$upper='abcdefghijklmnopqrstuvwxyz';$title=trim((string)$xpath->evaluate('string(//title)'));
        $add=static function(string $rule,string $state,string $category,string $severity,array $observed,string $advice,string $official)use(&$findings,$url,$checkedAt):void{$findings[]=['id'=>hash('sha256',$url."\n".$rule),'ruleId'=>$rule,'url'=>$url,'state'=>$state,'category'=>$category,'severity'=>$severity,'observed'=>$observed,'advice'=>$advice,'checkedAt'=>$checkedAt,'officialUrl'=>self::GOOGLE_DOC.$official];};
        $headers=array_change_key_case($headers,CASE_LOWER);foreach($headers as $key=>$value)if(is_array($value))$headers[$key]=implode(', ',$value);
        $canonicals=[];$invalid=0;foreach($xpath->query('//link[@rel]') as $node){if(!in_array('canonical',preg_split('/\s+/',strtolower($node->getAttribute('rel')))?:[],true))continue;$href=$node->getAttribute('href');$resolved=$href!==''?self::resolveUrl($url,$href):null;if($resolved===null)$invalid++;else $canonicals[]=$resolved;}
        foreach(preg_split('/,(?=\s*<)/',(string)($headers['link']??''))?:[] as $part)if(preg_match('/<([^>]+)>\s*;(.*)/',$part,$m)&&preg_match('/\brel\s*=\s*["\']?canonical(?:["\';\s]|$)/i',$m[2])){$resolved=self::resolveUrl($url,$m[1]);if($resolved===null)$invalid++;else $canonicals[]=$resolved;}
        $distinct=array_unique($canonicals);$canonicalPass=$invalid===0&&count($distinct)===1;
        $add('canonical-declaration',$canonicalPass?'pass':'fail','canonical',$invalid||count($distinct)>1?'review':'advice',['declared'=>array_slice($canonicals,0,20),'invalidCount'=>$invalid,'source'=>'html-and-http-link'],$distinct?'声明是首选 URL 提示，不能保证搜索引擎采用；冲突需人工复核。':'未观察到 canonical 声明；检查重复 URL 与首选版本，不代表索引被阻断。','crawling-indexing/consolidate-duplicate-urls');
        $directives=[];foreach($xpath->query('//meta[@name]') as $node){$name=strtolower($node->getAttribute('name'));if(in_array($name,['robots','googlebot'],true))$directives[]=$name.':'.mb_substr($node->getAttribute('content'),0,1000);}
        if(!empty($headers['x-robots-tag']))$directives[]='x-robots-tag:'.substr($headers['x-robots-tag'],0,4000);$noindex=false;foreach($directives as $d)if(preg_match('/(?:^|[\s,:])(?:noindex|none)(?:$|[\s,;])/i',$d))$noindex=true;
        $add('index-directives',$noindex?'fail':'pass','index-directive',$noindex?'review':'info',['directives'=>array_slice($directives,0,20),'noindex'=>$noindex],$noindex?'观察到 noindex 指令；可能有意限制索引，先确认站长意图。搜索引擎需能抓取页面才能读取该指令。':'本次原始 HTML 与响应头未观察到 noindex；不证明页面已索引或可被索引。','crawling-indexing/robots-meta-tag');
        $add('http-status',$status>=400?'fail':'pass','technical',$status>=400?'error':'info',['status'=>$status],'仅记录实际 HTTP 状态；页面是否被索引仍未知。','crawling-indexing/http-network-errors');
        $meta=static function(string $name,string $attribute='name')use($xpath,$lower,$upper):string{return trim((string)$xpath->evaluate('string(//meta[translate(@'.$attribute.',"'.$lower.'","'.$upper.'")="'.$name.'"]/@content)'));};
        $checks=['title'=>[$title!=='','title-link','缺少 title'],'description'=>[$meta('description')!=='','snippet','缺少 description'],'h1'=>[$xpath->query('//h1')->length>0,'title-link','缺少 h1'],'image-alt'=>[$xpath->query('//img[not(@alt)]')->length===0,'google-images','图片缺少 alt'],'open-graph'=>[$meta('og:title','property')!=='','title-link','缺少 OG'],'viewport'=>[$meta('viewport')!=='','page-experience','缺少视口']];
        foreach($checks as $name=>[$present,$doc,$issue]){$add('presentation-'.$name,$present?'pass':'fail','presentation',$present?'info':'advice',['present'=>$present,'renderMode'=>'initial-html'],'内容呈现、可读性或分享线索建议；缺失不证明排名下降。仅检查原始 HTML，未执行 JavaScript。','appearance/'.$doc);if(!$present)$issues[]=$issue;}
        if(!$canonicalPass)$issues[]=$canonicals?'canonical 声明冲突或无效':'缺少 canonical';if($noindex)$issues[]='观察到 noindex（可能有意，需确认）';if($status>=400)$issues[]='HTTP '.$status;
        return ['url'=>$url,'title'=>$title,'issues'=>$issues,'status'=>$status,'findings'=>$findings];
    }
    private static function redirectTarget(array $response,string $url,string $origin):?string
    {
        if(!in_array($response['status'],[301,302,303,307,308],true))return null;
        $headers=array_change_key_case($response['headers'],CASE_LOWER);$location=$headers['location']??null;
        if($location===null)return null;if(!is_string($location)||($next=self::resolveUrl($url,$location))===null||self::origin($next)!==$origin)throw new \RuntimeException('outbound_origin_denied');return $next;
    }
    private static function robotsResponse(string $origin,array $options):array
    {
        $url=$origin.'/robots.txt';for($hop=0;$hop<=4;$hop++){$response=self::request($url,$options);$next=self::redirectTarget($response,$url,$origin);if($next===null)return $response;$url=$next;}self::invalid('external_redirect_limit');
    }
    private static function crawlResponse(string $url,string $origin,string $robots,array $options,array &$metadata,int $delayMs):?array
    {
        for($hop=0;$hop<=4;$hop++){
            $path=parse_url($url,PHP_URL_PATH)?:'/';$query=parse_url($url,PHP_URL_QUERY);if($query!==null)$path.='?'.$query;
            if(!self::robotsAllowed($path,$robots)){$metadata['skipped'][]=['url'=>$url,'reason'=>'robots-denied'];return null;}
            if($metadata['fetched']>=30){$metadata['endReason']='page-budget';$metadata['skipped'][]=['url'=>$url,'reason'=>'page-budget'];return null;}
            if($metadata['fetched']>0&&$delayMs>0)usleep(min(10000,$delayMs)*1000);$metadata['fetched']++;
            try{$response=self::request($url,$options);$next=self::redirectTarget($response,$url,$origin);}catch(\Throwable){$metadata['skipped'][]=['url'=>$url,'reason'=>'fetch-failed'];return null;}
            if($next===null)return ['url'=>$url,'response'=>$response];$url=$next;
        }
        $metadata['skipped'][]=['url'=>$url,'reason'=>'fetch-failed'];return null;
    }
    public static function seoScan(App $a,string $site,array $targets=[],int $delayMs=2000):array
    {
        $settings=$a->store->get('sites',$site);if(!$settings)Http::error(404,'site_missing');$domain=(string)($settings['domain']??'');$root=self::resolveUrl(str_starts_with($domain,'https://')?$domain:'https://'.$domain,'/');
        if($root===null||parse_url($root,PHP_URL_SCHEME)!=='https')Http::error(400,'outbound_destination_blocked');$origin=self::origin($root);$targeted=$targets!==[];$pending=$targeted?$targets:[$root];
        foreach($pending as &$target){if(!is_string($target)||($target=self::resolveUrl($root,$target))===null||self::origin($target)!==$origin)Http::error(400,'outbound_destination_blocked');}unset($target);$pending=array_values(array_unique($pending));if(count($pending)>30)Http::error(400,'seo_target_limit');
        $epoch=$settings['epoch']??null;$privacy=External::epoch($a,$site);$checkedAt=Store::now();$metadata=['version'=>2,'renderMode'=>'initial-html','javascriptExecuted'=>false,'pageBudget'=>30,'fetched'=>0,'endReason'=>$targeted?'targeted':'exhausted-discovered-links','providerIndexStatus'=>'unknown','skipped'=>[],'checkedAt'=>$checkedAt];
        $options=['allowedOrigin'=>$origin,'followRedirects'=>false,'maxBytes'=>2097152,'headers'=>['User-Agent'=>'BaizeBot/0.1 (self-hosted analytics)']];$robots=self::robotsResponse($origin,$options);if(!in_array($robots['status'],[200,404],true))self::invalid('external_provider_failed');$robotsText=$robots['status']===200?$robots['text']:'';$seen=[];$results=[];
        while($pending&&$metadata['fetched']<30){$url=array_shift($pending);if(isset($seen[$url]))continue;$seen[$url]=true;$path=parse_url($url,PHP_URL_PATH)?:'/';$query=parse_url($url,PHP_URL_QUERY);if($query!==null)$path.='?'.$query;
            if(!self::robotsAllowed($path,$robotsText)){$metadata['skipped'][]=['url'=>$url,'reason'=>'robots-denied'];continue;}
            $fetch=self::crawlResponse($url,$origin,$robotsText,$options,$metadata,$delayMs);if($fetch===null)continue;$url=$fetch['url'];$seen[$url]=true;$response=$fetch['response'];
            $headers=array_change_key_case($response['headers'],CASE_LOWER);$contentType=$headers['content-type']??'';if(is_array($contentType))$contentType=implode(',',$contentType);
            if($contentType!==''&&!preg_match('~^(?:text/html|application/xhtml\+xml)(?:;|$)~i',$contentType)){$metadata['skipped'][]=['url'=>$url,'reason'=>'non-html'];continue;}
            $page=self::inspectSeo($url,$response['text'],$response['status'],$headers,$checkedAt);$results[]=$page;
            if(!$targeted){$dom=new \DOMDocument();$prior=libxml_use_internal_errors(true);try{$dom->loadHTML('<?xml encoding="utf-8" ?>'.$response['text'],LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);}finally{libxml_clear_errors();libxml_use_internal_errors($prior);}foreach($dom->getElementsByTagName('a') as $anchor){$next=self::resolveUrl($url,$anchor->getAttribute('href'));if($next!==null&&self::origin($next)===$origin&&parse_url($next,PHP_URL_QUERY)===null&&!isset($seen[$next])&&count($pending)+count($seen)<1000)$pending[]=$next;}}
        }
        if($pending){$metadata['endReason']='page-budget';foreach(array_slice(array_values(array_unique($pending)),0,1000) as $url)if(!isset($seen[$url]))$metadata['skipped'][]=['url'=>$url,'reason'=>'page-budget'];}
        $titles=[];foreach($results as $page)$titles[$page['title']]=($titles[$page['title']]??0)+1;
        foreach($results as &$page){$duplicate=$page['title']!==''&&$titles[$page['title']]>1;if($duplicate)$page['issues'][]='重复 title';$page['findings'][]=['id'=>hash('sha256',$page['url']."\nduplicate-title"),'ruleId'=>'duplicate-title','url'=>$page['url'],'state'=>$duplicate?'fail':($metadata['skipped']?'unknown':'pass'),'category'=>'presentation','severity'=>$duplicate?'advice':'info','observed'=>['title'=>$page['title'],'count'=>$titles[$page['title']],'scope'=>'fetched-pages-only','skipped'=>count($metadata['skipped'])],'advice'=>'仅对本次已抓取页面比较标题；未抓页面未知，检查内容区分，不证明排名下降。','checkedAt'=>$checkedAt,'officialUrl'=>self::GOOGLE_DOC.'appearance/title-link'];}unset($page);
        $id=Store::uuid();$record=['id'=>$id,'site_id'=>$site,'results'=>$results,'metadata'=>$metadata,'created_at'=>$checkedAt];
        $a->db->transaction(function()use($a,$site,$settings,$epoch,$privacy,$record,$id){$a->db->lock('site:'.$site);$current=$a->store->get('sites',$site);if(!$current||$current['domain']!==$settings['domain']||($current['epoch']??null)!==$epoch||External::epoch($a,$site)!==$privacy)Http::error(409,'evidence_missing');$a->store->put('seo_scans',$id,$record,$site);});
        return ['id'=>$id,'results'=>$results,'metadata'=>$metadata,'created_at'=>$checkedAt];
    }
    public static function seoRecheck(App $a,string $site,string $beforeScanId,int $delayMs=2000):array
    {
        $before=$a->store->get('seo_scans',$beforeScanId);if(!$before||($before['site_id']??null)!==$site||($before['metadata']['version']??null)!==2)Http::error(409,'seo_evidence_missing');$failures=[];$targets=[];
        foreach($before['results'] as $page)foreach($page['findings']??[] as $finding)if(($finding['state']??null)==='fail'){$failures[]=$finding;$targets[]=$finding['url'];}
        if(!$failures)return ['comparedWith'=>$beforeScanId,'scanId'=>null,'findingResults'=>[],'interpretation'=>'原扫描没有可复检的失败规则；不推断索引、排名或业务收益。'];
        $after=self::seoScan($a,$site,array_values(array_unique($targets)),$delayMs);$comparisons=[];
        foreach($failures as $prior){$next=null;foreach($after['results'] as $page)if($page['url']===$prior['url'])foreach($page['findings'] as $finding)if($finding['ruleId']===$prior['ruleId'])$next=$finding;$reason=null;if($next===null){$reason='not-fetched';foreach($after['metadata']['skipped'] as $skipped)if($skipped['url']===$prior['url'])$reason=$skipped['reason'];}$comparisons[]=['findingId'=>$prior['id'],'url'=>$prior['url'],'ruleId'=>$prior['ruleId'],'before'=>$prior,'after'=>$next,'status'=>($next['state']??null)==='pass'?'fixed':((($next['state']??null)==='fail')?'persists':'unknown'),'reason'=>$reason,'interpretation'=>'仅验证同一技术观察；不证明索引、排名或业务收益。'];}
        return ['comparedWith'=>$beforeScanId,'scanId'=>$after['id'],'findingResults'=>$comparisons,'metadata'=>$after['metadata']];
    }
}
