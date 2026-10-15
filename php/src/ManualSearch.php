<?php
declare(strict_types=1);
namespace Baize;

/** User-declared aggregate CSV stays separate from official provider and visitor facts. */
final class ManualSearch
{
    public const SCOPE='user-supplied-custom-search-aggregate';
    public const TEMPLATE="day,query,page,clicks,impressions,position\r\n";
    public const MAX_BYTES=5*1048576;
    public const MAX_ROWS=100000;
    private const FIELDS=['day','query','page','clicks','impressions','position'];
    private static function invalid(string $message='CSV 格式或字段值无效'):never{Http::error(400,'external_config_invalid',$message);}
    private static function length(string $text):int{return intdiv(strlen(mb_convert_encoding($text,'UTF-16LE','UTF-8')),2);}
    private static function trim(string $text):string{return preg_replace('/^[\s\p{Z}\x{FEFF}]+|[\s\p{Z}\x{FEFF}]+$/u','',$text);}
    public static function records(string $text):array
    {
        if(strlen($text)>self::MAX_BYTES||!mb_check_encoding($text,'UTF-8'))self::invalid('CSV 须为不超过5 MiB的 UTF-8 文件');
        if(str_starts_with($text,"\xEF\xBB\xBF"))$text=substr($text,3);$rows=[];$row=[];$cell='';$quoted=false;$closed=false;
        $pushCell=function()use(&$row,&$cell,&$closed):void{if(self::length($cell)>8192)self::invalid('单个 CSV 单元格过长');$row[]=$cell;$cell='';$closed=false;if(count($row)>100)self::invalid('CSV 列数超过100');};
        $pushRow=function()use(&$rows,&$row,$pushCell):void{$pushCell();if(count(array_filter($row,fn($v)=>$v!=='')))$rows[]=$row;$row=[];if(count($rows)>self::MAX_ROWS+1)self::invalid('CSV 行数超过100000');};
        for($i=0,$size=strlen($text);$i<$size;$i++){$char=$text[$i];if($quoted){if($char==='"'){if(($text[$i+1]??'')==='"'){$cell.='"';$i++;}else{$quoted=false;$closed=true;}}else $cell.=$char;}
            elseif($char===',')$pushCell();elseif($char==="\n"||$char==="\r"){if($char==="\r"&&($text[$i+1]??'')==="\n")$i++;$pushRow();}
            elseif($char==='"'){if($cell!==''||$closed)self::invalid();$quoted=true;}else{if($closed)self::invalid();$cell.=$char;}if(strlen($cell)>32768)self::invalid('单个 CSV 单元格过长');}
        if($quoted)self::invalid('CSV 引号未闭合');if($cell!==''||$row||$closed)$pushRow();if(count($rows)<2)self::invalid('CSV 至少需要表头和一行数据');return $rows;
    }
    private static function page(string $page,string $domain):string
    {
        if(strlen($page)>8192||preg_match('/[\x00-\x1f\x7f\\\\]/',$page))self::invalid('页面 URL 含不安全字符');
        $url=parse_url($page);$host=strtolower(rtrim((string)(parse_url('https://'.$domain,PHP_URL_HOST)?:$domain),'.'));
        if(!$url||!in_array(strtolower($url['scheme']??''),['http','https'],true)||strtolower(rtrim($url['host']??'','.'))!==$host||isset($url['user'])||isset($url['pass'])||(isset($url['port'])&&!in_array([$url['scheme'],$url['port']],[['https',443],['http',80]],true)))self::invalid('页面 URL 须属于当前站点，且不含凭据或非默认端口');
        $path=$url['path']??'/';if($path==='')$path='/';$segments=[];$parts=explode('/',$path);foreach($parts as $index=>$segment){$dot=strtolower(preg_replace('/%2e/i','.',$segment));if($dot==='.') {if($index===count($parts)-1)$segments[]='';continue;}if($dot==='..'){array_pop($segments);if($index===count($parts)-1)$segments[]='';continue;}$segments[]=$segment;}$path=implode('/',$segments);if(!str_starts_with($path,'/'))$path='/'.$path;
        $path=preg_replace_callback('/[\x00-\x20\x7f-\xff"<>`{}]/',fn($m)=>rawurlencode($m[0]),$path);
        return strtolower($url['scheme']).'://'.strtolower($url['host']).$path;
    }
    public static function parse(array $input,string $domain):array
    {
        if(array_diff(array_keys($input),['csv','label','mapping','customTemplateAcknowledged'])||($input['customTemplateAcknowledged']??null)!==true||!is_string($input['csv']??null)||!is_string($input['label']??null)||!is_array($input['mapping']??null))self::invalid('需确认自定义聚合模板并提供 CSV、来源说明与完整字段映射');
        $label=self::trim($input['label']);if(self::length($label)<1||self::length($label)>120)self::invalid('来源说明须为1–120个字符');$mapping=[];
        if(array_diff(array_keys($input['mapping']),self::FIELDS)||count($input['mapping'])!==6)self::invalid('字段映射必须包含全部六个字段');
        foreach(self::FIELDS as $field){$value=$input['mapping'][$field]??null;if(!is_string($value)||self::length($value)<1||self::length($value)>200)self::invalid('映射表头长度无效');$mapping[$field]=$value;}
        if(count(array_unique($mapping))!==6)self::invalid('字段映射不能重复');$table=self::records($input['csv']);$headers=array_map([self::class,'trim'],array_shift($table));if(in_array('',$headers,true)||count(array_unique($headers))!==count($headers)||array_diff($mapping,$headers))self::invalid('表头须唯一，并包含映射中的确切名称');
        $columns=[];foreach($mapping as $field=>$header)$columns[$field]=array_search($header,$headers,true);$rows=[];$start='9999-12-31';$end='0001-01-01';
        foreach($table as $cells){if(count($cells)!==count($headers))self::invalid('CSV 数据列数与表头不一致');$get=fn(string $key):string=>self::trim($cells[$columns[$key]]);$day=$get('day');if(!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$day,$date)||(int)$date[1]===0||!checkdate((int)$date[2],(int)$date[3],(int)$date[1]))self::invalid('日期须为有效的 YYYY-MM-DD');
            $query=$get('query');if($query===''||self::length($query)>1024||preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/',$query))self::invalid('搜索词为空、过长或包含控制字符');$page=self::page($get('page'),$domain);
            $number=function(string $field,bool $integer)use($get):int|float{$raw=$get($field);if(!preg_match('/^\d+(?:\.\d+)?$/D',$raw))self::invalid('点击、展现和排名须为非负数');$value=(float)$raw;if(!is_finite($value)||$value>9007199254740991||($integer&&floor($value)!==$value))self::invalid('点击与展现须为安全整数');return $integer||floor($value)===$value?(int)$value:$value;};
            $clicks=$number('clicks',true);$impressions=$number('impressions',true);$position=$number('position',false);if($clicks>$impressions||$position>1000000)self::invalid('点击不能超过展现，平均排名不能超过1000000');
            $rows[]=compact('day','query','page','clicks','impressions','position');$start=min($start,$day);$end=max($end,$day);
        }
        $digest=hash('sha256',json_encode(['label'=>$label,'mapping'=>$mapping,'rows'=>$rows],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_LINE_TERMINATORS));return compact('rows','headers','digest','start','end','label','mapping');
    }
    public static function safeCsvCell(mixed $value):string{$text=(string)($value??'');if(preg_match('/^[\s\p{Z}\x{FEFF}]*[=+\-@\t\r]/u',$text))$text="'".$text;return '"'.str_replace('"','""',$text).'"';}
    private static function imported(App $a,string $site,string $id):array{$v=$a->store->get('manual_search_imports',$id);if(!$v||$v['site_id']!==$site)Http::error(404,'evidence_missing');return $v;}
    public static function commit(App $a,string $site,array $input,string $actor,?Http $request=null):array
    {
        return $a->db->transaction(function()use($a,$site,$input,$actor,$request){$a->db->lock('site:'.$site);if($request)$a->auth->authorize($request,$site,'admin');$settings=$a->store->get('sites',$site);if(!$settings)Http::error(404,'site_missing');$parsed=self::parse($input,$settings['domain']);$digest=$parsed['digest'];$indexId=$site.':'.$digest;$old=$a->store->get('manual_search_digests',$indexId);if($old&&$a->store->get('manual_search_imports',$old['id']))return ['scope'=>self::SCOPE,'id'=>$old['id'],'rowCount'=>$old['row_count'],'reused'=>true,'officialProviderVerified'=>false];
            $id=Store::uuid();$count=count($parsed['rows']);$batch=['id'=>$id,'site_id'=>$site,'label'=>$parsed['label'],'digest'=>$digest,'mapping'=>$parsed['mapping'],'start_day'=>$parsed['start'],'end_day'=>$parsed['end'],'row_count'=>$count,'created_at'=>Store::now()];$a->store->put('manual_search_imports',$id,$batch,$site);
            $values=[];$params=[];foreach($parsed['rows'] as $i=>$row){$rid=$id.':'.str_pad((string)$i,6,'0',STR_PAD_LEFT);$values[]='(?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))';array_push($params,'manual_search_rows',$rid,$site,json_encode(['id'=>$rid,'import_id'=>$id,'site_id'=>$site,'row_number'=>$i]+$row,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));if(count($values)===500||$i===$count-1){$a->db->exec('INSERT INTO documents(kind,id,site_id,body,created_at,updated_at) VALUES'.implode(',',$values),$params);$values=[];$params=[];}}
            $a->store->put('manual_search_digests',$indexId,['id'=>$id,'row_count'=>$count],$site);$a->audit($actor,$site,'manual-search.import',['id'=>$id,'digest'=>$digest,'rowCount'=>$count]);return ['scope'=>self::SCOPE,'id'=>$id,'rowCount'=>$count,'reused'=>false,'officialProviderVerified'=>false];});
    }
    public static function register(App $a,Router $r):void
    {
        $base='/api/sites/:siteId/manual-search';
        $r->add('GET',$base.'/template',function(Http $h)use($a){$a->auth->authorize($h,$h->params['siteId'],'admin');header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="custom-search-template.csv"');echo self::TEMPLATE;return null;});
        $r->add('POST',$base.'/preview',function(Http $h)use($a){$s=$h->params['siteId'];$a->auth->authorize($h,$s,'admin');$p=self::parse($h->body,$a->store->get('sites',$s)['domain']);return ['scope'=>self::SCOPE,'officialProviderVerified'=>false,'rows'=>array_slice($p['rows'],0,20),'rowCount'=>count($p['rows']),'start'=>$p['start'],'end'=>$p['end'],'digest'=>$p['digest'],'previewLimit'=>20];});
        $r->add('POST',$base.'/commit',function(Http $h)use($a){$s=$h->params['siteId'];$u=$a->auth->authorize($h,$s,'admin');return self::commit($a,$s,$h->body,$u['id'],$h);});
        $r->add('GET',$base,function(Http $h)use($a){$s=$h->params['siteId'];$a->auth->authorize($h,$s);$imports=$a->store->list('manual_search_imports',$s);usort($imports,fn($x,$y)=>strcmp($y['created_at'],$x['created_at'])?:strcmp($y['id'],$x['id']));$rows=array_map(fn($v)=>array_intersect_key($v,array_flip(['id','label','start_day','end_day','row_count','created_at'])),array_slice($imports,0,100));return ['scope'=>self::SCOPE,'imports'=>$rows,'truncated'=>count($imports)>100,'limit'=>100,'officialProviderVerified'=>false];});
        $r->add('GET',$base.'/:id',function(Http $h)use($a){$s=$h->params['siteId'];$a->auth->authorize($h,$s);$item=self::imported($a,$s,$h->params['id']);$records=$a->db->all('SELECT body FROM documents WHERE kind=? AND site_id=? AND id>=? AND id<? ORDER BY id LIMIT 1001',['manual_search_rows',$s,$item['id'].':',$item['id'].';']);$rows=array_map(function($row){$v=json_decode($row['body'],true,32,JSON_THROW_ON_ERROR);$v['ctr']=$v['impressions']?$v['clicks']/$v['impressions']:null;return array_intersect_key($v,array_flip(['day','query','page','clicks','impressions','position','ctr']));},array_slice($records,0,1000));return ['scope'=>self::SCOPE,'import'=>$item,'rows'=>$rows,'truncated'=>$item['row_count']>1000,'rowCount'=>$item['row_count'],'limit'=>1000,'officialProviderVerified'=>false];});
        $r->add('GET',$base.'/:id/csv',function(Http $h)use($a){$s=$h->params['siteId'];$a->auth->authorize($h,$s,'admin');$item=self::imported($a,$s,$h->params['id']);$records=$a->db->all('SELECT body FROM documents WHERE kind=? AND site_id=? AND id>=? AND id<? ORDER BY id LIMIT 100001',['manual_search_rows',$s,$item['id'].':',$item['id'].';']);if(count($records)>self::MAX_ROWS)Http::error(409,'external_response_invalid');header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="custom-search.csv"');echo self::TEMPLATE;foreach($records as $row){$v=json_decode($row['body'],true,32,JSON_THROW_ON_ERROR);echo implode(',',array_map(fn($key)=>self::safeCsvCell($v[$key]),self::FIELDS))."\r\n";}return null;});
        $r->add('GET','/api/sites/:siteId/seo/conversions',function(Http $h)use($a){$s=$h->params['siteId'];$a->auth->authorize($h,$s);return self::seoConversions($a,$s,$h->query);});
    }
    public static function seoConversions(App $a,string $siteId,array $query):array
    {
        $zone=new \DateTimeZone($a->store->get('sites',$siteId)['timezone']??'UTC');$start=$query['start']??gmdate('Y-m-d',time()-7*86400);$end=$query['end']??gmdate('Y-m-d');
        foreach([$start,$end] as $day)if(!is_string($day)||!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$day,$m)||!checkdate((int)$m[2],(int)$m[3],(int)$m[1]))Http::error(400,'invalid_range');if($end<$start||(strtotime($end)-strtotime($start))/86400>3650)Http::error(400,'invalid_range');
        $from=(new \DateTimeImmutable($start.'T00:00:00',$zone))->format(DATE_ATOM);$to=(new \DateTimeImmutable($end.'T00:00:00',$zone))->modify('+1 day')->format(DATE_ATOM);
        return $a->db->transaction(function()use($a,$siteId,$start,$end,$from,$to,$zone){$a->db->lock('site:'.$siteId);$stats=Analytics::stats($a,$siteId,['from'=>$from,'to'=>$to]);$report=[];
            $empty=fn($path)=>['path'=>$path,'clicks'=>0,'impressions'=>0,'position'=>null,'pv'=>0,'sessions'=>0,'conversions'=>0,'revenueByCurrency'=>[]];
            foreach($a->store->list('gsc_stats',$siteId) as $v){$day=$v['day']??'';if($day<$start||$day>$end)continue;$url=parse_url((string)($v['page']??''));if(!$url||!in_array($url['scheme']??'',['http','https'],true)||!isset($url['host']))continue;$path=$url['path']??'/';$report[$path]??=$empty($path);$item=&$report[$path];$impressions=(int)($v['impressions']??0);$old=$item['impressions'];$item['position']=$old+$impressions>0?(($item['position']??0)*$old+(float)($v['position']??0)*$impressions)/($old+$impressions):null;$item['clicks']+=(int)($v['clicks']??0);$item['impressions']+=$impressions;unset($item);}
            foreach($stats['dimensionRows'] as $v){if(($v['dimensions']['channel']??'')!=='search')continue;$path=$v['dimensions']['path']??'/';$report[$path]??=$empty($path);$item=&$report[$path];$item['pv']+=$v['pv'];foreach(['sessions','conversions'] as $metric)$item[$metric]=$item[$metric]===null||$v[$metric]===null?null:$item[$metric]+$v[$metric];foreach((array)($v['revenueByCurrency']??[]) as $currency=>$amount)$item['revenueByCurrency'][$currency]=Decimal::add($item['revenueByCurrency'][$currency]??'0',(string)$amount);unset($item);}
            foreach($report as &$v){if(($stats['metricCoverage']['sessions']??0)<1)$v['sessions']=null;if(($stats['metricCoverage']['definitions']??0)<1)$v['conversions']=null;$v['revenueByCurrency']=(object)$v['revenueByCurrency'];}unset($v);ksort($report);
            return ['rows'=>array_values($report),'clickSemantics'=>'reported-query-detail-subtotal','providerDetailCompleteness'=>'not-guaranteed','providerTimezone'=>'America/Los_Angeles','siteTimezone'=>$zone->getName(),'latencyDays'=>'2–3','scope'=>'自然搜索会话与目标转化按会话首个页面归因，与 GSC 已返回查询词的页面点击小计对照；PV/收入为事件发生页口径，收入按币种独立显示','warning'=>'GSC 为提供商报告日，站内为站点时区，日期口径可能不同。聚合查询词不可关联具体访客或订单，点击与转化对照不证明因果','coverage'=>$stats['coverage'],'rangeStatus'=>$stats['rangeStatus'],'metricCoverage'=>$stats['metricCoverage'],'manualSearchIncluded'=>false];});
    }
}
