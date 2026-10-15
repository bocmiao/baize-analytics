#!/usr/bin/env php
<?php
declare(strict_types=1);
if(in_array('--help',$argv,true)){echo "Usage: php bin/export.php SITE_ID PRIVATE_OUTPUT_PATH\nExports the selected site after applying its independent privacy journal.\n";exit(0);}
require dirname(__DIR__).'/bootstrap.php';
try{$app=new Baize\App(baize_config());Baize\Governance::configure($app->config,$app->store);if($argc!==3)throw new RuntimeException('Usage: php bin/export.php SITE_ID PRIVATE_OUTPUT_PATH');$value=Baize\Operations::exportSite($app,$argv[1],true);Baize\Operations::writeFile($argv[2],Baize\Operations::json($value));$result=['path'=>$argv[2],'manifest'=>$value['manifest']];echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES).PHP_EOL;}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
