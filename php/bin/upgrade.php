#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
if(in_array('--help',$argv,true)){echo "Usage: php bin/upgrade.php --plan\n       php bin/upgrade.php --apply PLAN_SHA256 --backup-dir VERIFIED_BACKUP\nRequires BAIZE_PHP_MIGRATION_SOURCE_STOPPED=1 and an isolated restore rehearsal. MySQL DDL is not automatically reversible.\n";exit(0);}
try{
    $app=new Baize\App(baize_config());$files=[];foreach(glob(dirname(__DIR__).'/migrations/*.sql')?:[] as $p)$files[]=['version'=>basename($p),'sha256'=>hash_file('sha256',$p)];
    $current=array_column($app->db->all('SELECT version FROM schema_migrations ORDER BY version'),'version');$plan=['current'=>$current,'target'=>$files,'pending'=>array_values(array_filter($files,fn($f)=>!in_array($f['version'],$current,true))),'automaticRollback'=>false];$hash=hash('sha256',json_encode($plan,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES));
    if($argc===2&&$argv[1]==='--plan'){echo json_encode(['planSha256'=>$hash]+$plan,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES).PHP_EOL;exit(0);}
    if($argc!==5||$argv[1]!=='--apply'||$argv[3]!=='--backup-dir'||!hash_equals($hash,$argv[2]))throw new RuntimeException('MIGRATION_PLAN_CONFIRMATION_REQUIRED');
    if(getenv('BAIZE_PHP_MIGRATION_SOURCE_STOPPED')!=='1')throw new RuntimeException('MIGRATION_STOPPED_SOURCE_ACK_REQUIRED');
    if($app->db->all('SELECT ID FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND ID<>CONNECTION_ID()'))throw new RuntimeException('MIGRATION_OTHER_DATABASE_CONNECTIONS');
    $backup=realpath($argv[4]);if(!$backup||is_link($argv[4]))throw new RuntimeException('MIGRATION_BACKUP_INVALID');$manifest=json_decode((string)file_get_contents($backup.'/manifest.json'),true,64,JSON_THROW_ON_ERROR);
    if(($manifest['format']??'')!=='baize-php-update-backup-v1'||($manifest['schema']??null)!==$current)throw new RuntimeException('MIGRATION_BACKUP_SCHEMA_MISMATCH');
    $names=[];foreach($manifest['files']??[] as $f){$name=$f['path']??'';if(!is_string($name)||!preg_match('~^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$~D',$name)||in_array('..',explode('/',$name),true))throw new RuntimeException('MIGRATION_BACKUP_PATH_INVALID');$path=$backup.'/'.$name;if(is_link($path)||!is_file($path)||filesize($path)!==$f['bytes']||!hash_equals($f['sha256'],hash_file('sha256',$path)))throw new RuntimeException('MIGRATION_BACKUP_INTEGRITY_FAILED');$names[]=$name;}
    if(!in_array('database.json',$names,true)||!in_array('config.php',$names,true)||!array_filter($names,fn($n)=>str_starts_with($n,'keys/')))throw new RuntimeException('MIGRATION_BACKUP_INCOMPLETE');
    $state=$app->config['data_dir'].'/schema-migration-intent.json';if(file_exists($state)){ $old=json_decode((string)file_get_contents($state),true,32,JSON_THROW_ON_ERROR);if(($old['status']??'')!=='completed')throw new RuntimeException('MIGRATION_UNCERTAIN_REQUIRES_OPERATOR_RECOVERY'); }
    Baize\Operations::writeFile($state,json_encode(['status'=>'applying','planSha256'=>$hash,'backupManifestSha256'=>hash_file('sha256',$backup.'/manifest.json'),'startedAt'=>gmdate('c')],JSON_THROW_ON_ERROR));
    // DDL may commit per statement. Any failure leaves the durable intent intact;
    // inspect the actual schema and recover a clone before another explicit migration.
    $result=Baize\Operations::upgrade($app);Baize\Operations::writeFile($state,json_encode(['status'=>'completed','planSha256'=>$hash,'completedAt'=>gmdate('c')],JSON_THROW_ON_ERROR));echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES).PHP_EOL;
}catch(Throwable $e){fwrite(STDERR,preg_match('/^[A-Z_]+$/D',$e->getMessage())?$e->getMessage().PHP_EOL:"MIGRATION_FAILED_REQUIRES_OPERATOR_INSPECTION\n");exit(1);}
