<?php
declare(strict_types=1);
spl_autoload_register(static function(string $class):void{if(str_starts_with($class,'Baize\\')){$name=substr($class,6);$file=__DIR__.'/src/'.$name.'.php';if(is_file($file))require_once $file;elseif($name==='HttpError')require_once __DIR__.'/src/Http.php';}});

function baize_config_path():string{return getenv('BAIZE_CONFIG_PATH')?:__DIR__.'/private/config.php';}
function baize_config():array
{
    $path=baize_config_path();if(!is_file($path))throw new RuntimeException('INSTALL_CONFIG_MISSING');
    Baize\Installer::privateDirectory(dirname($path));$stat=lstat($path);if(is_link($path)||!$stat||($stat['mode']&0077)!==0||$stat['nlink']!==1)throw new RuntimeException('INSTALL_CONFIG_UNSAFE');
    $config=require $path;if(!is_array($config))throw new RuntimeException('INSTALL_CONFIG_INVALID');
    $config['data_dir']??=__DIR__.'/private/data';$config['key_dir']??=__DIR__.'/private/keys';$config['public_url']??='http://localhost';
    foreach(['data_dir','key_dir'] as $field)Baize\Installer::privateDirectory($config[$field]);
    if(!isset($config['master_key'])){$file=$config['key_dir'].'/master.v1.key';if(!is_file($file))throw new RuntimeException('MASTER_KEY_MISSING');$config['master_key']=Baize\Installer::readKey($file);}
    return $config;
}
