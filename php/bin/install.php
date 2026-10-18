#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
try{
    if(in_array('--prepare',$argv,true)){
        $dir=dirname(baize_config_path()).'/keys';$guard=Baize\Installer::prepareFiles($dir);fwrite(STDOUT,"已生成私有安装凭据。请在服务器读取 nonce（不要粘贴到聊天）：\n".$guard['path']."\n");exit(0);
    }
    if(in_array('--stdin-json',$argv,true)){
        $raw=stream_get_contents(STDIN,32769);if(strlen($raw)>32768)throw new RuntimeException('INPUT_TOO_LARGE');$input=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($input))throw new RuntimeException('INVALID_INPUT');Baize\Installer::install($input,baize_config_path());fwrite(STDOUT,"安装完成。\n");exit(0);
    }
    fwrite(STDOUT,"用法：php bin/install.php --prepare\n然后在自己的 HTTPS /install.php 页面输入凭据。\n自动化环境可从受保护标准输入传入 JSON：--stdin-json（不会回显秘密）。\n");
}catch(Throwable $e){
    // CLI 运行在本机受信环境，必须把失败原因打出来；只返回类名会让排障无从下手。
    $detail=$e instanceof Baize\HttpError?$e->errorCode:trim(get_class($e).($e->getMessage()!==''?': '.$e->getMessage():''));
    fwrite(STDERR,"安装未完成：".$detail."\n");exit(1);
}
