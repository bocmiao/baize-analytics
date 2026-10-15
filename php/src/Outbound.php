<?php
declare(strict_types=1);
namespace Baize;

/** DNS-pinned outbound HTTP. Redirects are validated independently. */
final class Outbound
{
    public static function publicIp(string $ip): bool
    {
        if (!filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)) return false;
        $bytes=@inet_pton($ip);if($bytes===false)return false;
        $blocks=str_contains($ip,':')?['::/96','::ffff:0:0/96','64:ff9b::/96','64:ff9b:1::/48','100::/64','2001::/23','2001:db8::/32','2002::/16','fc00::/7','fe80::/10','ff00::/8']:['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'];
        foreach($blocks as $cidr){[$base,$bits]=explode('/',$cidr);$network=inet_pton($base);$whole=intdiv((int)$bits,8);$rest=(int)$bits%8;if(substr($bytes,0,$whole)===substr($network,0,$whole)&&(!$rest||((ord($bytes[$whole])^ord($network[$whole]))&(255<<(8-$rest)))===0))return false;}
        return true;
    }
    public static function localIp(string $ip):bool
    {
        $bytes=@inet_pton(trim($ip,'[]'));if($bytes===false)return false;
        if(strlen($bytes)===16&&substr($bytes,0,12)===str_repeat("\0",10)."\xff\xff")$bytes=substr($bytes,12);
        if(strlen($bytes)===4){$a=ord($bytes[0]);$b=ord($bytes[1]);return $a===127||$a===10||$a===172&&$b>=16&&$b<=31||$a===192&&$b===168;}
        return $bytes===inet_pton('::1')||(ord($bytes[0])&0xfe)===0xfc;
    }
    public static function localModelOrigin(string $origin):bool
    {
        try{$u=parse_url($origin);if(!$u||!isset($u['scheme'],$u['host'])||isset($u['user'])||isset($u['pass'])||!in_array($u['scheme'],['http','https'],true)||self::origin($origin)!==$origin)return false;$host=strtolower(trim($u['host'],'[]'));return $host==='localhost'||self::localIp($host);}catch(\Throwable){return false;}
    }
    public static function origin(string $url): string
    {
        $u=parse_url($url);if(!$u||!isset($u['scheme'],$u['host']))throw new \RuntimeException('outbound_url_invalid');return strtolower($u['scheme']).'://'.strtolower($u['host']).(isset($u['port'])?':'.$u['port']:'');
    }
    public static function request(string $url,array $options=[]): array
    {
        if(!function_exists('curl_init'))throw new \RuntimeException('curl_extension_required');
        $method=strtoupper($options['method']??'GET');$headers=$options['headers']??[];$body=$options['body']??null;$max=max(1,min(134217728,(int)($options['maxBytes']??4194304)));$sink=$options['sink']??null;if($sink!==null&&(!is_resource($sink)||get_resource_type($sink)!=='stream'))throw new \InvalidArgumentException('outbound_sink_invalid');
        for($redirect=0;$redirect<=4;$redirect++){
            $u=parse_url($url);$local=isset($options['allowLocalOrigin'])&&self::origin($url)===$options['allowLocalOrigin'];if(isset($options['allowedOrigin'])&&self::origin($url)!==$options['allowedOrigin'])throw new \RuntimeException('outbound_origin_denied');if($local&&!self::localModelOrigin($options['allowLocalOrigin']))throw new \RuntimeException('outbound_address_denied');
            if(!$u||!isset($u['scheme'],$u['host'])||isset($u['user'])||isset($u['pass'])||isset($u['fragment'])||(!($u['scheme']==='https'||($local&&$u['scheme']==='http'))))throw new \RuntimeException('outbound_url_invalid');
            $host=strtolower(trim($u['host'],'[]'));$port=(int)($u['port']??($u['scheme']==='https'?443:80));if($port<1||$port>65535)throw new \RuntimeException('outbound_url_invalid');
            $ips=filter_var($host,FILTER_VALIDATE_IP)?[$host]:array_values(array_unique(array_filter(array_merge(array_column(dns_get_record($host,DNS_A)?:[],'ip'),array_column(dns_get_record($host,DNS_AAAA)?:[],'ipv6')))));
            if(!$ips)throw new \RuntimeException('outbound_dns_failed');foreach($ips as $ip)if($local?!self::localIp($ip):!self::publicIp($ip))throw new \RuntimeException('outbound_address_denied');
            $responseHeaders=[];$text='';$received=0;$overflow=false;if($sink!==null){if(!ftruncate($sink,0)||!rewind($sink))throw new \RuntimeException('outbound_sink_unavailable');}$ch=curl_init($url);$list=[];foreach($headers as $name=>$value){if(is_int($name))$list[]=$value;else {if(preg_match('/[\r\n]/',(string)$name.(string)$value))throw new \RuntimeException('outbound_header_invalid');$list[]=$name.': '.$value;}}
            $pin=str_contains($ips[0],':')?'['.$ips[0].']':$ips[0];
            curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>45,CURLOPT_HTTPHEADER=>$list,CURLOPT_ENCODING=>'',CURLOPT_PROXY=>'',CURLOPT_RESOLVE=>[$host.':'.$port.':'.$pin],CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_WRITEFUNCTION=>static function($curl,string $chunk)use(&$text,&$overflow,&$received,$max,$sink){$length=strlen($chunk);if($received+$length>$max){$overflow=true;return 0;}$received+=$length;if($sink!==null){$written=0;while($written<$length){$n=fwrite($sink,substr($chunk,$written));if($n===false||$n===0)return 0;$written+=$n;}}else $text.=$chunk;return $length;},CURLOPT_HEADERFUNCTION=>static function($curl,string $line)use(&$responseHeaders){$pair=explode(':',$line,2);if(count($pair)===2)$responseHeaders[strtolower(trim($pair[0]))]=trim($pair[1]);return strlen($line);}]);
            if($body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,$body);
            $ok=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);if($overflow)throw new \RuntimeException('external_response_too_large');if($ok===false)throw new \RuntimeException('external_transport_failed');
            if(($options['followRedirects']??true)&&in_array($status,[301,302,303,307,308],true)&&isset($responseHeaders['location'])){
                if($redirect===4)throw new \RuntimeException('external_redirect_limit');$next=$responseHeaders['location'];if(str_starts_with($next,'/'))$next=self::origin($url).$next;
                if(self::origin($next)!==self::origin($url))foreach(array_keys($headers) as $name)if(in_array(strtolower((string)$name),['authorization','cookie','x-api-key'],true))unset($headers[$name]);
                if($status===303||(($status===301||$status===302)&&$method==='POST')){$method='GET';$body=null;}$url=$next;continue;
            }
            return ['status'=>$status,'text'=>$text,'headers'=>$responseHeaders,'bytes'=>$received];
        }
        throw new \RuntimeException('external_redirect_limit');
    }
    public static function json(string $url,array $options=[]): array
    {
        $r=self::request($url,$options);if($r['status']<200||$r['status']>=300)throw new \RuntimeException('external_provider_failed');$data=json_decode($r['text'],true,128,JSON_THROW_ON_ERROR);if(!is_array($data))throw new \RuntimeException('external_response_invalid');return $data;
    }
}
