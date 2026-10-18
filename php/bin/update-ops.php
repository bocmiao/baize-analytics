#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
if(PHP_SAPI!=='cli'||count($argv)!==3||!in_array($argv[1],['preflight','backup'],true)){fwrite(STDERR,"Usage: php bin/update-ops.php preflight|backup DESTINATION\n");exit(1);}
try{
    $config=baize_config();foreach(['BAIZE_CONFIG_PATH','BAIZE_UPDATE_DATA_DIR','BAIZE_UPDATE_KEY_DIR'] as $name)if(!getenv($name))throw new RuntimeException('UPDATE_PHP_EXTERNAL_CONFIG_REQUIRED');
    if($config['data_dir']!==getenv('BAIZE_UPDATE_DATA_DIR')||$config['key_dir']!==getenv('BAIZE_UPDATE_KEY_DIR')||$config['public_url']!==getenv('BAIZE_UPDATE_PUBLIC_URL'))throw new RuntimeException('UPDATE_PHP_CONFIG_BINDING_MISMATCH');
    if(PHP_VERSION_ID<80300||!function_exists('pcntl_async_signals'))throw new RuntimeException('UPDATE_PHP_RUNTIME_UNSUPPORTED');
    foreach(['pdo_mysql','curl','mbstring','dom','openssl','zlib','intl'] as $extension)if(!extension_loaded($extension))throw new RuntimeException('UPDATE_PHP_EXTENSION_MISSING');
    $app=new Baize\App($config);Baize\Governance::configure($app->config,$app->store);
    $expected=array_map('basename',glob(dirname(__DIR__).'/migrations/*.sql')?:[]);sort($expected);$actual=array_column($app->db->all('SELECT version FROM schema_migrations ORDER BY version'),'version');if($actual!==$expected)throw new RuntimeException('UPDATE_SCHEMA_CHANGE_REQUIRES_OPERATOR');
    if($argv[1]==='preflight'){echo json_encode(['ready'=>true]).PHP_EOL;exit(0);}
    // The supervisor has drained and stopped its only HTTP/queue writers. Also reject
    // visible connections to this database; the operator must exclude external writers.
    $connections=$app->db->all('SELECT ID FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND ID<>CONNECTION_ID()');if($connections)throw new RuntimeException('UPDATE_PHP_OTHER_DATABASE_CONNECTIONS');
    $destination=$argv[2];if(file_exists($destination)||!mkdir($destination,0700))throw new RuntimeException('UPDATE_BACKUP_DESTINATION_EXISTS');
    Baize\Operations::backup($app,$destination.'/database.json');
    $inventory=[];$copy=function(string $source,string $target)use(&$copy,&$inventory,$destination):void{$s=lstat($source);if(is_link($source))throw new RuntimeException('UPDATE_DATA_SYMLINK_UNSUPPORTED');if(is_dir($source)){if(!mkdir($target,0700))throw new RuntimeException('UPDATE_BACKUP_DIRECTORY_FAILED');foreach(new DirectoryIterator($source) as $file)if(!$file->isDot())$copy($file->getPathname(),$target.'/'.$file->getFilename());}elseif(is_file($source)&&$s['nlink']===1){$bytes=(string)file_get_contents($source);Baize\Operations::writeFile($target,$bytes);$inventory[]=['path'=>substr($target,strlen($destination)+1),'bytes'=>strlen($bytes),'sha256'=>hash('sha256',$bytes)];}else throw new RuntimeException('UPDATE_BACKUP_FILE_UNSUPPORTED');};
    $copy($config['data_dir'],$destination.'/data');$copy($config['key_dir'],$destination.'/keys');$copy(baize_config_path(),$destination.'/config.php');
    $inventory[]=['path'=>'database.json','bytes'=>filesize($destination.'/database.json'),'sha256'=>hash_file('sha256',$destination.'/database.json')];
    foreach($inventory as $file)if(filesize($destination.'/'.$file['path'])!==$file['bytes']||!hash_equals($file['sha256'],hash_file('sha256',$destination.'/'.$file['path'])))throw new RuntimeException('UPDATE_BACKUP_VERIFY_FAILED');
    Baize\Operations::writeFile($destination.'/manifest.json',json_encode(['format'=>'baize-php-update-backup-v1','files'=>$inventory,'schema'=>$actual,'codeOnlyRollback'=>true],JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES));echo json_encode(['backupCreated'=>true,'files'=>count($inventory)]).PHP_EOL;
}catch(Throwable $e){fwrite(STDERR,preg_match('/^UPDATE_[A-Z_]+$/D',$e->getMessage())?$e->getMessage().PHP_EOL:"UPDATE_PHP_OPERATION_FAILED\n");exit(1);}
