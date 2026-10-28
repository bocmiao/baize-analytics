<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';

$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/';
if($path==='/install'||$path==='/install.php'){require __DIR__.'/install.php';return;}
if(!is_file(baize_config_path())){
    if(str_starts_with($path,'/api/')||$path==='/healthz'){http_response_code(503);header('Content-Type: application/json; charset=utf-8');echo '{"error":"installation_required","message":"请先在 HTTPS 安装页完成配置"}';}
    else{header('Location: /install.php',true,302);}return;
}
if(!str_starts_with($path,'/api/')&&$path!=='/healthz'&&$path!=='/embed/chart'){
    $spa=__DIR__.'/index.html';if(!is_file($spa)){http_response_code(503);header('Content-Type: text/plain; charset=utf-8');echo '预构建前端文件缺失，请使用完整 PHP 发行包。';return;}
    // SPA 外壳引用带内容哈希的资源，必须每次回源校验；否则部署新版本后浏览器会
    // 继续用缓存里的旧 HTML + 旧 JS，表现为"改了没生效"。哈希资源本身可长缓存。
    header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-cache, must-revalidate');header('X-Content-Type-Options: nosniff');header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");readfile($spa);return;
}
try{$app=new Baize\App(baize_config());$app->register();$app->run();}
catch(Throwable $e){http_response_code(503);header('Content-Type: application/json; charset=utf-8');error_log('Baize PHP startup failed: '.get_class($e));echo '{"error":"startup_unavailable","message":"实例暂不可用，请检查数据库、迁移和私有配置"}';}
