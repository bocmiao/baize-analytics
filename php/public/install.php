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
            ? '数据库连接失败：主机名填容器/服务名（不是 127.0.0.1），库名必须已存在，用户名不要带面板显示的 @主机 后缀。'
            : '请检查私有目录权限与安装凭据；已有配置时可从 /app 完成初始化。';
        $error='安装未完成（'.$code.'）。'.$hint;
    }
}
$noncePath=dirname(baize_config_path()).'/keys/install-nonce.json';
?><!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>安装白泽 PHP 标准版</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#f6f8fa;color:#172b4d;margin:0;padding:32px 20px}main{max-width:680px;margin:auto;background:white;border:1px solid #d0d7de;border-radius:8px;padding:28px}h1{font-size:24px;margin:0 0 12px}h2{font-size:18px;margin-top:24px}label{display:block;margin:14px 0}input{box-sizing:border-box;display:block;width:100%;padding:10px;border:1px solid #8c959f;border-radius:4px;font:inherit}input:focus{outline:2px solid #0969da;outline-offset:2px}button{background:#0969da;color:white;border:0;border-radius:4px;padding:12px 20px;font:inherit;cursor:pointer}.note{color:#4b5563;font-size:14px;overflow-wrap:anywhere}.error{color:#a01111;border-left:3px solid;padding:10px}code{overflow-wrap:anywhere}.preflight{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;padding:0;list-style:none}.preflight li{font-size:13px;padding:4px 10px;border-radius:999px;border:1px solid #d0d7de;background:#f6f8fa}.preflight .ok{color:#0a7d4f;border-color:#b7e0cd;background:#eefaf4}.preflight .warn{color:#8a5a00;border-color:#f0d9a8;background:#fff8e8}.preflight .bad{color:#a01111;border-color:#f3c2c2;background:#fff2f2}details{margin:14px 0;font-size:14px}summary{cursor:pointer;color:#4b5563}pre{background:#0d1117;color:#e6edf3;padding:14px;border-radius:6px;overflow:auto;font-size:13px;line-height:1.55}.hint{font-size:13px;color:#4b5563;margin:-4px 0 12px}</style>
<main><h1>安装白泽 PHP 标准版</h1><p>连接你的数据库并创建实例管理员。安装完成后，日常访问使用同一套 React 分析界面。</p>
<?php if($error):?><p class="error" role="alert"><?=$escape($error)?></p><?php endif;?>
<?php
$requiredExtensions=['pdo_mysql','curl','mbstring','dom','Phar','openssl','zlib','intl'];
$missingExtensions=array_values(array_filter($requiredExtensions,static fn(string $ext):bool=>!extension_loaded($ext)));
$geoOk=extension_loaded('bcmath')||extension_loaded('gmp');
$privateOk=true;$privateError='';
try{Baize\Installer::privateDirectory(dirname(baize_config_path()));}catch(Throwable $e){$privateOk=false;$privateError=$e->getMessage();}
$packageRoot=dirname(__DIR__);
?>
<ul class="preflight" aria-label="环境自检">
 <li class="<?=$missingExtensions?'bad':'ok'?>"><?=$missingExtensions?'缺少扩展：'.$escape(implode(', ',$missingExtensions)):'PHP '.$escape(PHP_VERSION).'，扩展齐备'?></li>
 <li class="<?=$privateOk?'ok':'bad'?>"><?=$privateOk?'私有目录可写':'私有目录异常：'.$escape($privateError)?></li>
 <li class="<?=$geoOk?'ok':'warn'?>"><?=$geoOk?'GeoIP 解码可用':'未启用 bcmath/gmp，地域显示未知'?></li>
</ul>
<h2 style="margin-top:22px">安装凭据（可选）</h2>
<p class="note">数据库在<b>本机或私网</b>时（如 <code>127.0.0.1</code>、容器名 <code>mysql</code>、<code>172.x</code>），下面的 nonce 可以留空——安装器会先解析主机并确认数据库确实在这台机器/私网里。</p>
<p class="note">连接<b>公网数据库</b>时才必须提供 nonce：它证明你有这台服务器的写权限，否则任何能打开这个域名的人都能把实例接到他自己的数据库上。安装成功后 nonce 立即作废。</p>
<pre>docker exec -u www-data &lt;php容器&gt; php <?=$escape($packageRoot)?>/bin/install.php --prepare
docker exec -u www-data &lt;php容器&gt; cat <?=$escape($noncePath)?></pre>
<p class="note">第二条命令会打印 <code>{"version":1,"nonce":"…"}</code>，复制其中 <code>nonce</code> 的值（64 位十六进制）填到下面的输入框。不要把 nonce、数据库密码或管理员密码发到聊天和日志中。</p>
<details><summary>不想用网页安装？</summary><p class="note">可以在终端里一条命令装完：<code>docker exec -it -u www-data &lt;php容器&gt; php <?=$escape($packageRoot)?>/bin/install.php --interactive</code>，装完直接用同一组邮箱和密码登录 <code>/app</code>。安装前可先跑 <code>--check</code> 检查扩展与数据库。</p></details>
<form method="post" autocomplete="off"><h2>安装凭据与访问地址</h2><label>一次性安装 nonce（本机/私网数据库可留空）<input name="installationNonce" pattern="[a-f0-9]{64}" maxlength="64" type="password" autocomplete="off" placeholder="留空，或填 64 位十六进制"></label><label>公开访问地址（HTTPS）<input name="public_url" type="url" required placeholder="https://analytics.example.com"></label>
<h2>MySQL / MariaDB 数据库</h2><label>数据库主机<input name="db_host" required maxlength="253" placeholder="mysql"></label><p class="hint">Docker 部署填容器/服务名（如 <code>mysql</code>），PHP 直接跑在宿主机上则填 <code>127.0.0.1</code>。填公网地址会被拒绝，除非服务端显式开启 <code>BAIZE_ALLOW_REMOTE_DB=1</code>。</p><label>端口<input name="db_port" type="number" min="1" max="65535" value="3306" required></label><label>数据库名<input name="db_name" required value="baize" pattern="[a-zA-Z0-9_-]{1,64}"></label><label>数据库用户名<input name="db_user" required maxlength="128" placeholder="baize"></label><p class="hint">只填用户名。面板里显示的 <code>baize@%</code> 表示"允许从任意主机连接"，<code>@%</code> 不是用户名的一部分。</p><label>数据库密码<input name="db_password" type="password" autocomplete="new-password"></label>
<h2>实例管理员</h2><label>姓名<input name="name" required maxlength="128" value="管理员" autocomplete="name"></label><label>邮箱<input name="email" type="email" required maxlength="256" autocomplete="username"></label><label>密码（至少12个字符）<input name="password" type="password" required minlength="12" maxlength="1024" autocomplete="new-password"></label><p class="note">数据库必须是已创建的空库，安装器不负责建库或授权。网站根目录必须指向 <code>public/</code>；采集后的聚合由 PHP CLI 的 worker 完成。</p><button type="submit">安装并创建管理员</button></form></main></html>
