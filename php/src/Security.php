<?php
declare(strict_types=1);
namespace Baize;
final class Security
{
    public static function hashToken(string $value):string{return hash('sha256',$value);}
    public static function password(string $password):string
    {
        self::validatePassword($password);
        // bcrypt truncates at 72 bytes. SHA-384 prehash preserves every input byte.
        return 'php-sha384:'.password_hash(base64_encode(hash('sha384',$password,true)),PASSWORD_DEFAULT);
    }
    public static function hashPassword(string $password):string{return self::password($password);}
    public static function validatePassword(string $password):void
    {
        $utf16=iconv('UTF-8','UTF-16LE',$password);$length=$utf16===false?0:intdiv(strlen($utf16),2);
        if($length<12||$length>1024||strlen($password)>4096)Http::error(400,'invalid_password','密码需为12–1024个字符，且不超过4096 UTF-8字节');
    }
    public static function verifyPassword(string $password,string $hash):bool
    {
        if(str_starts_with($hash,'php-sha384:'))return password_verify(base64_encode(hash('sha384',$password,true)),substr($hash,11));
        if(str_starts_with($hash,'$argon2')||str_starts_with($hash,'$2'))return password_verify($password,$hash);
        // Node uses scrypt(N=16384,r=8,p=1,64). PHP has no portable native equivalent.
        // Import must rehash with a separately reviewed migration; never accept a guessed hash.
        return false;
    }
    public static function checkPassword(string $password,string $hash):bool{return self::verifyPassword($password,$hash);}
    private static function key(array $config,int $version):string
    {
        $active=(int)($config['master_key_version']??1);$key=$config['master_keys'][$version]??($version===$active?($config['master_key']??''):null);
        if($key===null&&isset($config['key_dir'])){$file=$config['key_dir'].'/master.v'.$version.'.key';if(is_file($file))$key=Installer::readKey($file);}
        if(is_string($key)&&strlen($key)===64&&ctype_xdigit($key))$key=hex2bin($key);
        if(!is_string($key)||strlen($key)!==32)throw new \RuntimeException('MASTER_KEY_UNAVAILABLE');return $key;
    }
    public static function seal(string $value,array $config):string
    {
        $v=(int)($config['master_key_version']??1);$iv=random_bytes(12);$tag='';$cipher=openssl_encrypt($value,'aes-256-gcm',self::key($config,$v),OPENSSL_RAW_DATA,$iv,$tag);
        if($cipher===false)throw new \RuntimeException('ENCRYPTION_FAILED');
        return json_encode(['v'=>$v,'iv'=>bin2hex($iv),'data'=>bin2hex($cipher),'tag'=>bin2hex($tag)],JSON_THROW_ON_ERROR);
    }
    public static function unseal(string $value,array $config):string
    {
        if(str_starts_with($value,'{')){$e=json_decode($value,true,32,JSON_THROW_ON_ERROR);$v=(int)($e['v']??1);
            if(isset($e['nonce'],$e['ciphertext'])){$ivRaw=base64_decode($e['nonce'],true);$cipherRaw=base64_decode($e['ciphertext'],true);$tagRaw=base64_decode($e['tag']??'',true);if($ivRaw===false||$cipherRaw===false||$tagRaw===false)throw new \RuntimeException('INVALID_SECRET_ENVELOPE');$iv=bin2hex($ivRaw);$cipher=bin2hex($cipherRaw);$tag=bin2hex($tagRaw);}
            else{$iv=$e['iv']??'';$cipher=$e['data']??'';$tag=$e['tag']??'';}}
        else {[$iv,$cipher,$tag]=array_pad(explode(':',$value),3,'');$v=1;}
        if(!is_string($iv)||!is_string($cipher)||!is_string($tag)||strlen($iv)!==24||strlen($tag)!==32||!ctype_xdigit($iv.$cipher.$tag))throw new \RuntimeException('INVALID_SECRET_ENVELOPE');
        $plain=openssl_decrypt(hex2bin($cipher),'aes-256-gcm',self::key($config,$v),OPENSSL_RAW_DATA,hex2bin($iv),hex2bin($tag));
        if($plain===false)throw new \RuntimeException('SECRET_AUTHENTICATION_FAILED');return $plain;
    }
    public static function randomToken(int $bytes=32):string{return rtrim(strtr(base64_encode(random_bytes($bytes)),'+/','-_'),'=');}
    public static function csrf(Http $r,array $config):void
    {
        if(in_array($r->method,['GET','HEAD','OPTIONS'],true)||$r->header('authorization')!==null||$r->path==='/api/collect'||preg_match('~^/api/v1/experiments/[^/]+/assign$~',$r->path))return;
        $url=parse_url($config['public_url']);$expected=($url['scheme']??'https').'://'.($url['host']??'').(isset($url['port'])?':'.$url['port']:'');
        $origin=$r->header('origin');if(($origin!==null&&!hash_equals($expected,$origin))||$r->header('sec-fetch-site')==='cross-site')Http::error(403,'csrf_origin_denied','跨站请求被拒绝');
    }
}
