#!/usr/bin/env php
<?php
declare(strict_types=1);
if(in_array('--help',$argv,true)){echo "Usage: php bin/upgrade.php\nApplies PHP schema migrations and privacy journal replay; install verified PHP code separately.\n";exit(0);}
if($argc!==1){fwrite(STDERR,"Usage: php bin/upgrade.php\n");exit(1);}
require dirname(__DIR__).'/bootstrap.php';
try{$app=new Baize\App(baize_config());Baize\Governance::configure($app->config,$app->store);$result=Baize\Operations::upgrade($app);echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES).PHP_EOL;}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
