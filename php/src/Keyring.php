<?php
declare(strict_types=1);
namespace Baize;

final class Keyring
{
    private static function readKey(string $path):string
    {
        clearstatcache(true,$path);$s=@lstat($path);if(!$s||is_link($path)||!is_file($path)||$s['nlink']!==1||($s['mode']&0077)!==0||$s['size']!==32)throw new \RuntimeException('MASTER_KEY_UNSAFE');$bytes=file_get_contents($path);if($bytes===false||strlen($bytes)!==32)throw new \RuntimeException('MASTER_KEY_UNAVAILABLE');return $bytes;
    }
    public static function initialize(App $app):void
    {
        try{$state=$app->store->get('instance_keyring','active');}catch(\PDOException $e){if($e->getCode()==='42S02')return;throw $e;}
        if(!$state)return;$version=$state['active_version']??null;if(!is_int($version)||$version<1||$version>1000000)throw new \RuntimeException('KEYRING_VERSION_INVALID');$app->config['master_key_version']=$version;$app->config['master_key']=self::readKey($app->config['key_dir'].'/master.v'.$version.'.key');
    }
    public static function rotate(App $app,string $actor):array
    {
        $result=$app->db->transaction(static function()use($app,$actor):array{
            $app->db->lock('instance:keyring');$state=$app->store->get('instance_keyring','active');$current=(int)($state['active_version']??$app->config['master_key_version']??1);$next=$current+1;if($next>1000000)throw new \RuntimeException('KEYRING_VERSION_LIMIT');
            // Materialize version one for direct-array configurations used by CLI integrations.
            $initial=$app->config['key_dir'].'/master.v'.$current.'.key';if(!is_file($initial)){if($current!==($app->config['master_key_version']??1))throw new \RuntimeException('MASTER_KEY_UNAVAILABLE');$key=$app->config['master_key'];if(strlen($key)===64&&ctype_xdigit($key))$key=hex2bin($key);Installer::privateWrite($initial,$key);}
            self::readKey($initial);$path=$app->config['key_dir'].'/master.v'.$next.'.key';if(!file_exists($path))Installer::privateWrite($path,random_bytes(32));self::readKey($path);
            $app->store->put('instance_keyring','active',['active_version'=>$next,'rotated_at'=>Store::now()]);$app->audit($actor,null,'keys.rotate',['version'=>$next,'previousVersionsRetained'=>true]);return ['version'=>$next,'previousVersionsRetained'=>true];
        });self::initialize($app);return $result;
    }
    public static function register(App $app,Router $router):void
    {
        $router->add('POST','/api/admin/keys/rotate',static function(Http $r)use($app):array{$u=$app->auth->admin($r);return self::rotate($app,$u['id']);});
    }
}
