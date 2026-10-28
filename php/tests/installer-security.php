<?php
declare(strict_types=1);
namespace Baize {
    // A hostname whose second resolution would leave the validated address.
    function gethostbynamel(string $host):array|false {
        if ($host==='installer-pin.test') { $GLOBALS['installer_dns_reads']++; return [$GLOBALS['installer_dns_reads']===1?'127.0.0.1':'8.8.8.8']; }
        return \gethostbynamel($host);
    }
}
namespace {
require dirname(__DIR__).'/bootstrap.php';
use Baize\{HttpError,Installer};
$checks=[];$admin=null;$database='baize_install_security_'.bin2hex(random_bytes(6));$private='/tmp/'.$database;
function check(bool $ok,string $name):void { global $checks;if(!$ok)throw new RuntimeException('Failed: '.$name);$checks[]=$name; }
function denied(callable $fn,int $status,string $code,string $name):void { try {$fn();throw new RuntimeException('Expected denial: '.$name);}catch(HttpError $e){check($e->status===$status&&$e->errorCode===$code,$name);} }
function removeFixture(string $path):void { if(!is_dir($path))return;foreach(new DirectoryIterator($path) as $entry){if($entry->isDot())continue;$name=$entry->getPathname();if($entry->isDir()&&!$entry->isLink())removeFixture($name);else unlink($name);}rmdir($path); }
try {
    $port=(int)(getenv('BAIZE_TEST_DB_PORT')?:3307);
    if(!in_array($port,[3307,3308],true))throw new RuntimeException('Disposable local database ports only');
    $admin=new PDO('mysql:host=127.0.0.1;port='.$port,'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $admin->exec('CREATE DATABASE '.$database.' CHARACTER SET utf8mb4');
    mkdir($private,0700);$guard=Installer::prepareFiles($private.'/keys');$nonce=json_decode(file_get_contents($guard['path']),true)['nonce'];
    $input=['public_url'=>'https://analytics.example.test','db_host'=>'127.0.0.1','db_port'=>$port,'db_name'=>$database,'db_user'=>'root','db_password'=>'','email'=>'owner@example.test','name'=>'Owner','password'=>'synthetic installer regression password'];
    foreach(['127.0.0.1','10.0.0.1','installer-pin.test'] as $host){
        denied(fn()=>Installer::install(array_replace($input,['db_host'=>$host]),$private.'/config.php'),403,'INSTALL_CREDENTIAL_REQUIRED','missing credential denied before database access: '.$host);
    }
    denied(fn()=>Installer::install($input+['installationNonce'=>str_repeat('a',64)],$private.'/config.php'),403,'INSTALL_CREDENTIAL_INVALID','wrong credential denied');
    check(!is_file($private.'/config.php')&&!is_file($private.'/keys/install-state.json'),'rejected requests persist no configuration or terminal claim');
    check((int)$admin->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$database'")->fetchColumn()===0,'unauthenticated install performs no schema writes');
    $input['installationNonce']=$nonce;
    foreach(['',"user\nname","user\0name"] as $user){denied(fn()=>Installer::install(array_replace($input,['db_user'=>$user]),$private.'/config.php'),400,'invalid_database_user','empty/control account rejected: '.bin2hex($user));}
    // Account names are independent PDO fields: do not mistake @ or spaces for a DSN suffix.
    foreach(['review@account','review account'] as $user){denied(fn()=>Installer::install(array_replace($input,['db_user'=>$user]),$private.'/config.php'),503,'database_unavailable','valid account spelling reaches database authentication: '.$user);}
    putenv('BAIZE_ALLOW_REMOTE_DB');
    denied(fn()=>Installer::install(array_replace($input,['db_host'=>'8.8.8.8']),$private.'/config.php'),400,'remote_database_not_allowed','public database requires explicit server opt-in');
    $GLOBALS['installer_dns_reads']=0;
    $app=Installer::install(array_replace($input,['db_host'=>'installer-pin.test']),$private.'/config.php');
    check($GLOBALS['installer_dns_reads']===1,'installation resolves hostname once');
    check(count($app->store->list('users'))===1,'valid credential creates exactly one administrator using pinned connection');
    check(str_contains((require $private.'/config.php')['database']['dsn'],'host=installer-pin.test;'),'persist owner service name for later restarts');
    check(!is_file($private.'/keys/install-nonce.json')&&is_file($private.'/keys/install-state.json'),'successful installation consumes nonce and closes setup');
    check((fileperms($private.'/config.php')&0077)===0,'configuration is private');
    denied(fn()=>Installer::install($input,$private.'/config.php'),409,'INSTALL_CONFIG_EXISTS','installation replay rejected');
    echo json_encode(['ok'=>true,'checks'=>count($checks),'port'=>$port,'passed'=>$checks],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE)."\n";
} catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n".$e->getTraceAsString()."\n");$failed=true;}
finally { if($admin)$admin->exec('DROP DATABASE IF EXISTS '.$database);removeFixture($private); }
exit(isset($failed)?1:0);
}
