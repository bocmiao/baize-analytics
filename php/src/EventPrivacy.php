<?php
declare(strict_types=1);
namespace Baize;

/** Privacy rules shared by intake, reads, replay and temporal identity projection. */
final class EventPrivacy
{
    public static function hash(string $secret, string $scope, string $value, string $extra = ''): string
    { return hash_hmac('sha256', $scope."\0".$value."\0".$extra, $secret); }

    public static function day(int|float|string $ts, string $timezone = 'UTC'): string
    {
        $seconds = is_numeric($ts) ? (float)$ts / 1000 : (float)(new \DateTimeImmutable($ts))->format('U.u');
        return (new \DateTimeImmutable('@'.(string)floor($seconds)))->setTimezone(new \DateTimeZone($timezone))->format('Y-m-d');
    }

    public static function iso(int|float $ms): string
    { return gmdate('Y-m-d\TH:i:s', (int)floor($ms / 1000)).sprintf('.%03dZ', ((int)$ms % 1000 + 1000) % 1000); }
    public static function millis(string|int|float $ts): float
    { return is_numeric($ts) ? (float)$ts : (float)(new \DateTimeImmutable($ts))->format('U.u') * 1000; }

    public static function page(string $secret, string $day, string $page): string
    {
        $hex = substr(self::hash($secret, $day, 'page', $page), 0, 32);
        $hex[12] = '8'; $hex[16] = dechex((hexdec($hex[16]) & 3) | 8);
        return substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
    }

    public static function stableKey(string $key): bool
    {
        $k = strtolower(preg_replace('/[^a-z0-9]/i', '', $key) ?? '');
        return (bool)preg_match('/^(?:uid|uuid|idfa|gaid|advertisingid|identity|identification|fingerprint|email|emailaddress|mail|phone|phonenumber|mobile|telephone|username|fullname|firstname|lastname|address|ip|ipaddress|cookie|authorization|token|accesstoken|ssn|contact|identifier|customer|device|userid)$|^(?:page|user|visitor|distinct|device|session|account|customer|external|anonymous|client|person|profile|member|contact|login).*(?:id|identifier)$/', $k);
    }
    public static function daily(mixed $value): mixed
    {
        if (is_string($value) && preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $value)) return null;
        $object=$value instanceof \stdClass;
        if (!$object&&!is_array($value)) return $value;
        $out = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && self::stableKey($key)) continue;
            $clean = self::daily($item); if ($clean !== null || $item === null) $out[$key] = $clean;
        }
        return $object?(object)$out:(array_is_list($value) ? array_values($out) : $out);
    }
    public static function clean(array $wire, string $ip, bool $daily): array
    {
        foreach (['url','referrer'] as $key) if (isset($wire[$key])) {
            $parts = parse_url((string)$wire[$key]);
            $wire[$key] = is_array($parts) && isset($parts['scheme'],$parts['host']) ? strtolower($parts['scheme']).'://'.$parts['host'].(isset($parts['port'])?':'.$parts['port']:'').($parts['path'] ?? '/') : '';
        }
        if (isset($wire['props'])) {
            $props=(array)$wire['props'];foreach ($props as $key => $value)
                if (preg_match('/password|secret|token|email|phone|authorization|ip_address/i', (string)$key) || $value === $ip || ($daily && (self::stableKey((string)$key) || is_string($value) && preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $value)))) unset($props[$key]);
            $wire['props']=(object)$props;
        }
        if ($daily) {
            $visitor=$wire['visitor_id']; $page=$wire['page_id']; $wire=self::daily($wire);
            $wire['visitor_id']=$visitor; $wire['page_id']=$page;
        }
        return $wire;
    }
    public static function deleted(Store $store, string $siteId, array $event): bool
    {
        return class_exists(Governance::class) && Governance::eventDeleted($store,$siteId,$event);
    }
    public static function identity(Store $store, string $siteId, string $visitor, int|float $ts, ?string $claimed=null, bool $transition=false): array
    {
        $probe=['site_id'=>$siteId,'visitor_id'=>$visitor,'ts'=>self::iso($ts),'payload'=>['user_id'=>$claimed]];
        if (self::deleted($store,$siteId,$probe)) return ['allowed'=>false,'user_id'=>null,'reason'=>'deleted_visitor'];
        $binding=null;
        foreach ($store->list('identity_bindings',$siteId) as $row) {
            if ($row['visitor_id'] !== $visitor || self::millis($row['started_at']) > $ts || isset($row['ended_at']) && self::millis($row['ended_at']) <= $ts) continue;
            if (!$binding || self::millis($row['started_at']) > self::millis($binding['started_at'])) $binding=$row;
        }
        $user=$binding['user_id'] ?? null; $probe['payload']['user_id']=$user;
        if (self::deleted($store,$siteId,$probe)) return ['allowed'=>false,'user_id'=>null,'reason'=>'deleted_visitor'];
        if ($claimed && !$transition && $claimed !== $user) return ['allowed'=>false,'user_id'=>$user,'reason'=>'identity_mismatch'];
        return ['allowed'=>true,'user_id'=>$user];
    }
    /** Caller holds the site's transaction lock. Same-time conflicting identifies fail. */
    public static function bind(Store $store, string $siteId, string $visitor, string $user, int|float $ts): bool
    {
        $rows=array_values(array_filter($store->list('identity_bindings',$siteId),fn($r)=>$r['visitor_id']===$visitor));
        foreach ($rows as $row) if (self::millis($row['started_at']) === (float)$ts) return $row['user_id'] === $user;
        $rows[]=['id'=>hash('sha256',$siteId.':'.$visitor.':'.$ts),'site_id'=>$siteId,'visitor_id'=>$visitor,'user_id'=>$user,'started_at'=>self::iso($ts),'ended_at'=>null];
        usort($rows,fn($a,$b)=>self::millis($a['started_at']) <=> self::millis($b['started_at']));
        foreach ($rows as $i => &$row) {
            $next=$rows[$i+1]['started_at'] ?? null;
            if ($next !== null && (!isset($row['ended_at']) || self::millis($next)<self::millis($row['ended_at']))) $row['ended_at']=$next;
            $store->put('identity_bindings',$row['id'],$row,$siteId);
        } unset($row);
        foreach ($store->list('events',$siteId) as $event) if ($event['visitor_id']===$visitor) {
            $identity=self::identity($store,$siteId,$visitor,self::millis($event['ts']));
            if (!$identity['allowed']) continue;
            unset($event['payload']['user_id']); if ($identity['user_id']) $event['payload']['user_id']=$identity['user_id'];
            if(isset($event['payload']['props']))$event['payload']['props']=(object)$event['payload']['props'];
            $store->put('events',$siteId.':'.$event['event_id'],$event,$siteId);
        }
        return true;
    }
    public static function replayMasked(mixed $frames): bool
    {
        if (!is_array($frames) || !array_is_list($frames) || count($frames)>500) return false;
        $nodes=0; $tags=explode(' ','html head body title meta link style div span p a img input textarea button form label select option ul ol li h1 h2 h3 h4 h5 h6 table tbody tr th td section article nav main header footer script noscript iframe canvas video audio svg path circle rect g br hr strong em small pre code #document');
        $walk=function(mixed $value,string $key='',int $depth=0) use (&$walk,&$nodes,$tags):bool {
            if (++$nodes>100000 || $depth>60) return false;
            if (is_string($value)) return match($key) {
                'name'=>$value==='html', 'tagName'=>in_array(strtolower($value),$tags,true), 'compatMode'=>in_array($value,['CSS1Compat','BackCompat'],true),
                'type'=>in_array($value,['text','password','email','number','checkbox','radio','submit','button','hidden','tel','url','search'],true),
                'width','height'=>(bool)preg_match('/^\d{1,5}$/D',$value), default=>(bool)preg_match('/^[*\s]*$/uD',$value)
            };
            if (!is_array($value)) return $value===null || is_int($value) || is_float($value) && is_finite($value) || is_bool($value);
            foreach ($value as $field=>$item) {
                if (is_string($field) && in_array(strtolower($field),['cookie','authorization','password','url','href','src','csstext','style'],true)) return false;
                if ($field==='attributes') { if (!is_array($item)) return false; foreach ($item as $attr=>$v) if (!in_array($attr,['type','width','height'],true)||!$walk($v,$attr,$depth+1)) return false; }
                elseif (!$walk($item,is_int($field)?$key:$field,$depth+1)) return false;
            } return true;
        };
        foreach ($frames as $frame) if (!is_array($frame)||!is_int($frame['type']??null)||!(is_int($frame['timestamp']??null)||is_float($frame['timestamp']??null))||!is_finite((float)$frame['timestamp'])||abs((float)$frame['timestamp'])>8640000000000000) return false;
        return $walk($frames);
    }
    public static function filterReplay(Store $store,string $siteId,string $visitor,array $frames):array
    {
        return array_values(array_filter($frames,fn($frame)=>isset($frame['timestamp']) && !self::deleted($store,$siteId,['visitor_id'=>$visitor,'type'=>'replay','ts'=>self::iso((float)$frame['timestamp']),'payload'=>$frame])));
    }
}
