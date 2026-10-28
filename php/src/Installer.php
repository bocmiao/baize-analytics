<?php
declare(strict_types=1);
namespace Baize;

/** The private nonce and terminal marker survive database restores/deletion. */
final class Installer
{
    public static function privateDirectory(string $dir):void
    {
        $path=$dir;while($path!==dirname($path)){if(is_link($path))throw new \RuntimeException('INSTALL_DIRECTORY_UNSAFE');$path=dirname($path);}
        if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new \RuntimeException('INSTALL_DIRECTORY_UNAVAILABLE');
        $stat=stat($dir);if(!$stat||($stat['mode']&0077)!==0)throw new \RuntimeException('INSTALL_DIRECTORY_UNSAFE');
        $real=realpath($dir);$public=realpath(dirname(__DIR__).'/public');if(!$real||($public&&($real===$public||str_starts_with($real,$public.DIRECTORY_SEPARATOR))))throw new \RuntimeException('INSTALL_DIRECTORY_PUBLIC');
    }
    private static function privateRead(string $file):array
    {
        clearstatcache(true,$file);$stat=lstat($file);
        if(!$stat||is_link($file)||!is_file($file)||($stat['mode']&0077)!==0||$stat['nlink']!==1||$stat['size']>4096)throw new \RuntimeException('INSTALL_CREDENTIAL_UNSAFE');
        $data=json_decode((string)file_get_contents($file),true,32,JSON_THROW_ON_ERROR);if(!is_array($data))throw new \RuntimeException('INSTALL_CREDENTIAL_INVALID');return $data;
    }
    public static function privateWrite(string $path,array|string $data):void
    {
        $dir=dirname($path);self::privateDirectory($dir);$pending=$path.'.pending.'.bin2hex(random_bytes(8));$f=@fopen($pending,'x+b');if(!$f)throw new \RuntimeException('PRIVATE_FILE_UNAVAILABLE');
        try{chmod($pending,0600);$bytes=is_array($data)?json_encode($data,JSON_THROW_ON_ERROR):$data;if(fwrite($f,$bytes)!==strlen($bytes)||!fflush($f))throw new \RuntimeException('PRIVATE_WRITE_FAILED');if(function_exists('fsync')&&!fsync($f))throw new \RuntimeException('PRIVATE_SYNC_FAILED');}
        catch(\Throwable $e){@unlink($pending);throw $e;}finally{fclose($f);}
        try{if(!@link($pending,$path))throw new \RuntimeException('PRIVATE_FILE_EXISTS_OR_UNAVAILABLE');}finally{@unlink($pending);}
        if(function_exists('fsync')){$handle=@fopen($dir,'r');if(!$handle)throw new \RuntimeException('PRIVATE_DIRECTORY_SYNC_FAILED');try{if(!@fsync($handle))throw new \RuntimeException('PRIVATE_DIRECTORY_SYNC_FAILED');}finally{fclose($handle);}}
    }
    public static function readKey(string $path):string
    {
        clearstatcache(true,$path);$stat=@lstat($path);
        if(!$stat||is_link($path)||!is_file($path)||($stat['mode']&0077)!==0||$stat['nlink']!==1||!in_array($stat['size'],[32,64],true))throw new \RuntimeException('MASTER_KEY_UNSAFE');
        $key=(string)file_get_contents($path);if(strlen($key)===64&&ctype_xdigit($key))$key=hex2bin($key);if(strlen($key)!==32)throw new \RuntimeException('MASTER_KEY_INVALID');return $key;
    }
    public static function prepareFiles(string $keyDir):array
    {
        self::privateDirectory($keyDir);
        if(file_exists($keyDir.'/install-state.json')||file_exists($keyDir.'/install-recovery-block.json'))throw new \RuntimeException('INSTALL_TERMINAL');
        $path=$keyDir.'/install-nonce.json';
        if(!file_exists($path)){try{self::privateWrite($path,['version'=>1,'nonce'=>bin2hex(random_bytes(32))]);}catch(\RuntimeException $e){if(!file_exists($path))throw $e;}}
        $nonce=self::privateRead($path);if(($nonce['version']??0)!==1||!preg_match('/^[a-f0-9]{64}$/D',$nonce['nonce']??''))throw new \RuntimeException('INSTALL_CREDENTIAL_INVALID');
        $keyFile=$keyDir.'/master.v1.key';if(!file_exists($keyFile)){try{self::privateWrite($keyFile,random_bytes(32));}catch(\RuntimeException $e){if(!file_exists($keyFile))throw $e;}}
        self::readKey($keyFile);
        return ['path'=>$path,'hash'=>Security::hashToken($nonce['nonce'])];
    }
    public static function verifyNonce(string $keyDir,string $supplied,string $expected):void
    {
        if(!preg_match('/^[a-f0-9]{64}$/D',$supplied))Http::error(403,'INSTALL_CREDENTIAL_REQUIRED');
        if(file_exists($keyDir.'/install-state.json')||file_exists($keyDir.'/install-recovery-block.json'))Http::error(409,'INSTALL_TERMINAL');
        $stored=self::privateRead($keyDir.'/install-nonce.json');$hash=Security::hashToken($stored['nonce']??'');
        if(!hash_equals($expected,$hash))Http::error(503,'INSTALL_BINDING_MISMATCH');
        if(!hash_equals($expected,Security::hashToken($supplied)))Http::error(403,'INSTALL_CREDENTIAL_INVALID');
    }
    public static function prepare(App $app):array
    {
        return $app->db->transaction(function()use($app){
            $app->db->lock('installation');$state=$app->store->get('install','state');$users=$app->store->list('users');$dir=$app->config['key_dir'];
            if($users){if(!$state||($state['state']??'')==='pending'){$state=['state'=>'legacy','created_at'=>Store::now()];$app->store->put('install','state',$state);}if(!file_exists($dir.'/install-state.json'))self::privateWrite($dir.'/install-state.json',['version'=>1,'state'=>'terminal']);return $state;}
            if($state&&($state['state']??'')!=='pending')return $state;
            if(file_exists($dir.'/install-state.json')||file_exists($dir.'/install-recovery-block.json')){$state=['state'=>'restored_blocked','created_at'=>Store::now()];$app->store->put('install','state',$state);return $state;}
            $nonce=self::prepareFiles($dir);
            if($state){if(!hash_equals($state['nonce_hash']??'',$nonce['hash']))Http::error(503,'INSTALL_BINDING_MISMATCH');return $state;}
            $state=['state'=>'pending','nonce_hash'=>$nonce['hash'],'created_at'=>Store::now()];$app->store->put('install','state',$state);return $state;
        });
    }
    /**
     * 安装只允许连接本机/私网数据库：攻击者最容易的做法是把实例指向自己的公网库。
     * 解析一次、按解析结果判定范围，调用方再用返回的 IP 建立首次连接，避免 DNS rebinding。
     */
    private static function databaseHost(string $host):array
    {
        $scope=static function(string $ip):string{
            if($ip==='127.0.0.1'||$ip==='::1')return 'loopback';
            return filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)===false?'private':'public';
        };
        if(filter_var($host,FILTER_VALIDATE_IP)!==false)return ['ip'=>$host,'scope'=>$scope($host)];
        $addresses=gethostbynamel($host);
        if($addresses===false||$addresses===[])Http::error(400,'database_host_unresolvable','数据库主机名无法解析；本机数据库请填 127.0.0.1 或容器名');
        foreach($addresses as $ip){if($scope($ip)==='public')return ['ip'=>$ip,'scope'=>'public'];}
        foreach($addresses as $ip){if($scope($ip)==='private')return ['ip'=>$ip,'scope'=>'private'];}
        return ['ip'=>$addresses[0],'scope'=>'loopback'];
    }
    public static function claim(App $app,array $body):array
    {
        $email=Auth::email($body['email']??'');$password=(string)($body['password']??'');Security::validatePassword($password);$name=Sites::text($body['name']??'管理员',1,128,'name');
        $user=$app->db->transaction(function()use($app,$body,$email,$password,$name){
            $app->db->lock('installation');$state=$app->store->get('install','state');
            if($app->store->list('users')||!$state||($state['state']??'')!=='pending')Http::error(409,'initialization_complete','初始化已完成或已封闭');
            // Database reachability does not prove ownership of this application.
            self::verifyNonce($app->config['key_dir'],(string)($body['installationNonce']??$body['nonce']??''),$state['nonce_hash']);
            // Write-ahead terminal guard: a crash/rollback after this point fails closed.
            // In particular, restoring an old pending DB and nonce cannot reopen setup.
            self::privateWrite($app->config['key_dir'].'/install-state.json',['version'=>1,'state'=>'claim_started','created_at'=>Store::now()]);
            $id=Store::uuid();$user=['id'=>$id,'email'=>$email,'name'=>$name,'is_admin'=>true,'password_hash'=>Security::password($password),'created_at'=>Store::now()];
            $app->store->put('users',$id,$user);$app->store->put('user_emails',Security::hashToken($email),['user_id'=>$id]);
            $app->store->put('install','state',['state'=>'claimed','claimed_user_id'=>$id,'claimed_at'=>Store::now()]);$app->audit($id,null,'setup',['email'=>$email]);return $user;
        });
        // A committed database terminal state remains authoritative even if filesystem cleanup fails.
        @unlink($app->config['key_dir'].'/install-nonce.json');
        return $user;
    }
    public static function install(array $input,string $configPath):App
    {
        $private=dirname($configPath);self::privateDirectory($private);$lock=fopen($private.'/installer.lock','c+b');if(!$lock)throw new \RuntimeException('INSTALL_LOCK_UNAVAILABLE');chmod($private.'/installer.lock',0600);
        try{
            if(!flock($lock,LOCK_EX))throw new \RuntimeException('INSTALL_LOCK_UNAVAILABLE');if(file_exists($configPath))Http::error(409,'INSTALL_CONFIG_EXISTS','已有配置，请通过初始化页面完成或恢复备份');
            $publicUrl=rtrim((string)($input['public_url']??''),'/');$url=parse_url($publicUrl);$local=in_array($url['host']??'',['localhost','127.0.0.1','::1'],true);
            if(!$url||!isset($url['host'])||isset($url['user'])||isset($url['pass'])||isset($url['query'])||isset($url['fragment'])||(!empty($url['path'])&&$url['path']!=='/')||!in_array($url['scheme']??'',['https','http'],true)||(($url['scheme']??'')!=='https'&&!$local))Http::error(400,'https_required','公网安装必须使用 HTTPS，且使用独立域名根目录');
            Auth::email($input['email']??'');Security::validatePassword((string)($input['password']??''));
            $host=(string)($input['db_host']??'127.0.0.1');$name=(string)($input['db_name']??'baize');$port=(int)($input['db_port']??3306);
            if(!preg_match('/^[a-zA-Z0-9_.:-]{1,253}$/D',$host)||!preg_match('/^[a-zA-Z0-9_-]{1,64}$/D',$name)||$port<1||$port>65535)Http::error(400,'invalid_database');
            $user=(string)($input['db_user']??'');
            // PDO receives the account name separately from the DSN. Quoted MySQL
            // accounts may contain spaces or @; reject control characters only.
            if($user===''||preg_match('/[\x00-\x1f\x7f]/',$user)!==0)Http::error(400,'invalid_database_user','数据库账号不能为空或含控制字符；请填写账号字段，不要附加面板单独显示的授权来源');
            $keyDir=$private.'/keys';$guard=self::prepareFiles($keyDir);
            self::verifyNonce($keyDir,(string)($input['installationNonce']??''),$guard['hash']);
            $target=self::databaseHost($host);$allowRemote=getenv('BAIZE_ALLOW_REMOTE_DB')==='1';
            if($target['scope']==='public'&&!$allowRemote)Http::error(400,'remote_database_not_allowed','只允许连接本机或私网数据库；确需外部数据库时，在服务端设置 BAIZE_ALLOW_REMOTE_DB=1 并加重启，同时仍要提供 nonce');

            $config=['database'=>['dsn'=>"mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4",'user'=>$user,'password'=>(string)($input['db_password']??'')],'data_dir'=>$private.'/data','key_dir'=>$keyDir,'public_url'=>$publicUrl];
            // The entire installation uses the validated address, not a second
            // hostname lookup. Persist the owner's service name for later restarts.
            $connectionConfig=$config;$connectionConfig['database']['dsn']="mysql:host={$target['ip']};port=$port;dbname=$name;charset=utf8mb4";
            try{$db=new Database($connectionConfig);$db->migrate();}
            catch(\PDOException $e){error_log('Baize installer database failure: '.$e->getMessage());Http::error(503,'database_unavailable','无法连接数据库：请检查主机名、端口、库名与账号密码');}$config['master_key']=self::readKey($keyDir.'/master.v1.key');$app=new App($config,$db);$state=self::prepare($app);
            if(($state['state']??'')!=='pending')Http::error(409,'INSTALL_TERMINAL');
            $saved=$config;unset($saved['master_key']);self::privateWrite($configPath,"<?php\nreturn ".var_export($saved,true).";\n");
            self::claim($app,$input);return $app;
        }finally{flock($lock,LOCK_UN);fclose($lock);}
    }
}
