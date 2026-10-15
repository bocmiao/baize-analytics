#!/usr/bin/env php
<?php
declare(strict_types=1);
if(in_array('--help',$argv,true)){echo "Usage: php bin/restore.php PRIVATE_BACKUP_PATH [--replace]\nRequires the matching current independent privacy journal, watermark, identity guard and original keys. Never replace them with an older backup.\n";exit(0);}
require dirname(__DIR__).'/bootstrap.php';
try{$app=new Baize\App(baize_config());Baize\Governance::journal($app->config,true);if($argc<2||$argc>3||($argc===3&&$argv[2]!=='--replace'))throw new RuntimeException('Usage: php bin/restore.php PRIVATE_BACKUP_PATH [--replace]');$result=Baize\Operations::restore($app,$argv[1],in_array('--replace',$argv,true));echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES).PHP_EOL;}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
