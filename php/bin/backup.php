#!/usr/bin/env php
<?php
declare(strict_types=1);
if(in_array('--help',$argv,true)){echo "Usage: php bin/backup.php PRIVATE_BACKUP_PATH\nEncrypted PHP snapshot; retain current keys and independent privacy journal separately.\n";exit(0);}
require dirname(__DIR__).'/bootstrap.php';
try{$app=new Baize\App(baize_config());Baize\Governance::configure($app->config,$app->store);if($argc!==2)throw new RuntimeException('Usage: php bin/backup.php PRIVATE_BACKUP_PATH');$result=Baize\Operations::backup($app,$argv[1]);echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES).PHP_EOL;}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
