#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
try{$app=new Baize\App(baize_config());$app->register();echo json_encode(['runtime'=>'actual PHP module registration','routes'=>$app->router->routes()],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).PHP_EOL;}
catch(Throwable $e){fwrite(STDERR,"Route inventory unavailable: ".get_class($e).PHP_EOL);exit(1);}
