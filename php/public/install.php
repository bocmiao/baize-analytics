<?php
declare(strict_types=1);
if(!function_exists('baize_config_path'))require dirname(__DIR__).'/bootstrap.php';
header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');header('Cache-Control: no-store');header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
$escape=static fn(string $v):string=>htmlspecialchars($v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');$error='';$installed=is_file(baize_config_path());
if($installed){header('Location: /app',true,303);return;}
$secure=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')||($_SERVER['SERVER_PORT']??'')==='443';
$local=in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true);
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
    try{
        if(!$secure&&!$local)Baize\Http::error(400,'https_required','安装页必须使用 HTTPS；若在可信反向代理后，请按部署文档传递 HTTPS 标识');
        $origin=$_SERVER['HTTP_ORIGIN']??null;$host=$_SERVER['HTTP_HOST']??'';$expected=($secure?'https':'http').'://'.$host;
        if(($origin!==null&&!hash_equals($expected,$origin))||($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site')Baize\Http::error(403,'csrf_origin_denied');
        if((int)($_SERVER['CONTENT_LENGTH']??0)>32768)Baize\Http::error(413,'request_too_large');
        $input=$_POST;$input['db_port']=(int)($input['db_port']??3306);$app=Baize\Installer::install($input,baize_config_path());header('Location: /app',true,303);return;
    }catch(Baize\HttpError $e){http_response_code($e->status);$error=$e->getMessage()!==''?$e->getMessage():$e->errorCode;}
    catch(Throwable $e){
        http_response_code(503);
        $code=$e instanceof Baize\HttpError?$e->errorCode:(new ReflectionClass($e))->getShortName();
        error_log('Baize installer failed: '.$code.' '.$e->getMessage());
        $hint=$e instanceof PDOException
            ? '数据库连接失败：请核对主机、端口、库名和账号；面板若单独显示授权来源，不要把来源拼入账号。'
            : '请检查私有目录权限与安装凭据；已有配置时可从 /app 完成初始化。';
        $error='安装未完成（'.$code.'）。'.$hint;
    }
}
$noncePath=dirname(baize_config_path()).'/keys/install-nonce.json';
?><!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>安装白泽 PHP 标准版</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#f6f8fa;color:#172b4d;margin:0;padding:32px 20px}main{max-width:680px;margin:auto;background:white;border:1px solid #d0d7de;border-radius:8px;padding:28px}h1{font-size:24px;margin:0 0 12px}h2{font-size:18px;margin-top:24px}label{display:block;margin:14px 0}input{box-sizing:border-box;display:block;width:100%;padding:10px;border:1px solid #8c959f;border-radius:4px;font:inherit}input:focus{outline:2px solid #0969da;outline-offset:2px}button{background:#0969da;color:white;border:0;border-radius:4px;padding:12px 20px;font:inherit;cursor:pointer}.note{color:#4b5563;font-size:14px;overflow-wrap:anywhere}.error{color:#a01111;border-left:3px solid;padding:10px}code{overflow-wrap:anywhere}</style>
<main><h1>安装白泽 PHP 标准版</h1><p>连接你的数据库并创建实例管理员。安装完成后，日常访问使用同一套 React 分析界面。</p>
<?php if($error):?><p class="error" role="alert"><?=$escape($error)?></p><?php endif;?>
<p class="note">先在服务器执行 <code>php bin/install.php --prepare</code>，再从私有文件 <code><?=$escape($noncePath)?></code> 复制 nonce。不要把数据库密码、nonce 或管理员密码发到聊天和日志中。</p>
<form method="post" autocomplete="off"><h2>安装凭据与访问地址</h2><label>一次性安装 nonce<input name="installationNonce" required pattern="[a-f0-9]{64}" maxlength="64" type="password" autocomplete="off"></label><label>公开访问地址（HTTPS）<input name="public_url" type="url" required placeholder="https://analytics.example.com"></label>
<h2>MySQL / MariaDB 数据库</h2><label>数据库主机<input name="db_host" required value="127.0.0.1" maxlength="253"></label><label>端口<input name="db_port" type="number" min="1" max="65535" value="3306" required></label><label>数据库名<input name="db_name" required value="baize" pattern="[a-zA-Z0-9_-]{1,64}"></label><label>数据库用户名<input name="db_user" required maxlength="128"></label><label>数据库密码<input name="db_password" type="password" autocomplete="new-password"></label>
<h2>实例管理员</h2><label>姓名<input name="name" required maxlength="128" value="管理员" autocomplete="name"></label><label>邮箱<input name="email" type="email" required maxlength="256" autocomplete="username"></label><label>密码（至少12个字符）<input name="password" type="password" required minlength="12" maxlength="1024" autocomplete="new-password"></label><p class="note">请使用已创建的空数据库。安装不创建数据库账号，也不修改数据库权限。Web 根目录必须指向 <code>public/</code>；队列和计划任务使用 PHP CLI。</p><button type="submit">安装并创建管理员</button></form></main></html>
