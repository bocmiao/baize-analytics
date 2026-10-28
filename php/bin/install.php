#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';

const BAIZE_REQUIRED_EXTENSIONS=['pdo_mysql','curl','mbstring','dom','Phar','openssl','zlib','intl'];

/** 权限类失败最常见的修法：把私有目录交给当前 PHP 用户，并收回 077。 */
function baize_repair_command(string $dir):string
{
    $uid=function_exists('posix_geteuid')?posix_geteuid():null;
    $gid=function_exists('posix_getegid')?posix_getegid():null;
    $owner=$uid!==null?$uid.':'.$gid:'<PHP运行用户>:<组>';
    return 'chown -R '.$owner.' '.escapeshellarg($dir).' && chmod 700 '.escapeshellarg($dir);
}

/** 安装前自检：把网页安装会在提交时才暴露的问题提前打出来。 */
function baize_cli_check(?array $db=null):int
{
    $ok=true;
    $say=static function(bool $pass,string $label,string $detail='')use(&$ok):void{
        $ok=$ok&&$pass;
        fwrite(STDOUT,($pass?'[ ok ]':'[FAIL]').' '.$label.($detail!==''?' — '.$detail:'')."\n");
    };
    $say(PHP_VERSION_ID>=80300,'PHP 版本 >= 8.3',PHP_VERSION);
    $missing=array_values(array_filter(BAIZE_REQUIRED_EXTENSIONS,static fn(string $ext):bool=>!extension_loaded($ext)));
    $say($missing===[],'必需扩展',$missing===[]?'全部已启用':'缺少 '.implode(', ',$missing));
    $geo=extension_loaded('bcmath')?'bcmath':(extension_loaded('gmp')?'gmp':'');
    $say($geo!=='','GeoIP 解码（bcmath 或 gmp）',$geo!==''?$geo:'两者都未启用，地域会显示未知');
    $privateDir=dirname(baize_config_path());
    try{Baize\Installer::privateDirectory($privateDir);$say(true,'私有配置目录',$privateDir);}
    catch(Throwable $e){
        $say(false,'私有配置目录',$privateDir.' → '.$e->getMessage());
        fwrite(STDOUT,'       修复（在宿主机以 root 执行）：'.baize_repair_command($privateDir)."\n");
    }
    if(is_file(baize_config_path())){
        fwrite(STDOUT,"[info] 安装状态 — 已安装，直接登录 /app（本检查只评估环境，不改变实例状态）\n");
    }else{
        $say(true,'安装状态','尚未安装');
    }
    if($db!==null){
        try{new PDO("mysql:host=$db[host];port=$db[port];dbname=$db[name];charset=utf8mb4",$db['user'],$db['password']);$say(true,'数据库连接',"$db[host]:$db[port]/$db[name]");}
        catch(Throwable $e){$say(false,'数据库连接',$e->getMessage());}
    }else{
        fwrite(STDOUT,"[skip] 数据库连接 — 设置 BAIZE_DB_HOST/BAIZE_DB_USER/BAIZE_DB_PASS 后重跑可一并检测\n");
    }
    return $ok?0:1;
}

/** 先看环境变量，再读终端；这样面板计划任务/脚本里能完全免交互。 */
function baize_cli_ask(string $label,string $env,?string $default=null):string
{
    $value=getenv($env);
    if($value!==false&&$value!=='')return $value;
    fwrite(STDOUT,$label.($default!==null?" [$default]":'').': ');
    $line=fgets(STDIN);
    $line=$line===false?'':trim($line);
    return $line===''?(string)$default:$line;
}

/** Never fall back to echoed input when a terminal cannot hide credentials. */
function baize_cli_secret(string $label,string $env):string
{
    $value=getenv($env);if($value!==false&&$value!=='')return $value;
    if(!function_exists('stream_isatty')||!stream_isatty(STDIN)||PHP_OS_FAMILY==='Windows')throw new RuntimeException('安全终端输入不可用；请从受保护标准输入使用 --stdin-json');
    $pipes=[];$process=proc_open(['stty','-g'],[0=>STDIN,1=>['pipe','w'],2=>['pipe','w']],$pipes);
    if(!is_resource($process))throw new RuntimeException('无法读取终端状态；请使用 --stdin-json');
    $state=trim(stream_get_contents($pipes[1]));fclose($pipes[1]);fclose($pipes[2]);
    if(proc_close($process)!==0||$state==='')throw new RuntimeException('无法读取终端状态；请使用 --stdin-json');
    $process=proc_open(['stty','-echo'],[0=>STDIN,1=>STDOUT,2=>STDERR],$pipes);
    if(!is_resource($process)||proc_close($process)!==0)throw new RuntimeException('无法关闭密码回显；请使用 --stdin-json');
    $restored=false;$restore=static function()use($state,&$restored):void{
        if($restored)return;$restored=true;$pipes=[];$process=proc_open(['stty',$state],[0=>STDIN,1=>STDOUT,2=>STDERR],$pipes);if(is_resource($process))proc_close($process);
    };
    register_shutdown_function($restore);
    if(function_exists('pcntl_async_signals')&&function_exists('pcntl_signal')){
        pcntl_async_signals(true);foreach([SIGINT,SIGTERM] as $signal)pcntl_signal($signal,static function(int $signal)use($restore):void{$restore();exit(128+$signal);});
    }
    try{
        fwrite(STDOUT,$label.': ');$line=fgets(STDIN);
        if($line===false)throw new RuntimeException('终端输入已关闭');
        return rtrim($line,"\r\n");
    }finally{$restore();fwrite(STDOUT,"\n");}
}

try{
    if(in_array('--check',$argv,true)){
        $db=getenv('BAIZE_DB_HOST')?[
            'host'=>(string)getenv('BAIZE_DB_HOST'),
            'port'=>(int)(getenv('BAIZE_DB_PORT')?:3306),
            'name'=>getenv('BAIZE_DB_NAME')?:'baize',
            'user'=>(string)getenv('BAIZE_DB_USER'),
            'password'=>(string)getenv('BAIZE_DB_PASS'),
        ]:null;
        exit(baize_cli_check($db));
    }
    if(in_array('--interactive',$argv,true)){
        $input=[
            'installationNonce'=>baize_cli_secret('一次性安装 nonce（先运行 --prepare）','BAIZE_INSTALLATION_NONCE'),
            'public_url'=>baize_cli_ask('公开访问地址（https://你的域名）','BAIZE_PUBLIC_URL'),
            'db_host'=>baize_cli_ask('数据库主机（容器名，不是 127.0.0.1）','BAIZE_DB_HOST','127.0.0.1'),
            'db_port'=>(int)baize_cli_ask('数据库端口','BAIZE_DB_PORT','3306'),
            'db_name'=>baize_cli_ask('数据库名','BAIZE_DB_NAME','baize'),
            'db_user'=>baize_cli_ask('数据库账号（不附加面板单独显示的授权来源）','BAIZE_DB_USER'),
            'db_password'=>baize_cli_secret('数据库密码','BAIZE_DB_PASS'),
            'name'=>baize_cli_ask('管理员姓名','BAIZE_ADMIN_NAME','管理员'),
            'email'=>baize_cli_ask('管理员邮箱','BAIZE_ADMIN_EMAIL'),
            'password'=>baize_cli_secret('管理员密码（至少 12 位）','BAIZE_ADMIN_PASSWORD'),
        ];
        Baize\Installer::install($input,baize_config_path());
        fwrite(STDOUT,"安装完成。\n  登录：".$input['public_url']."/app\n  队列：每分钟执行一次 `php bin/worker.php --once`（面板计划任务里配置同一命令）\n");exit(0);
    }
    if(in_array('--prepare',$argv,true)){
        $dir=dirname(baize_config_path()).'/keys';$guard=Baize\Installer::prepareFiles($dir);fwrite(STDOUT,"已生成私有安装凭据。请在服务器读取 nonce（不要粘贴到聊天）：\n".$guard['path']."\n");exit(0);
    }
    if(in_array('--stdin-json',$argv,true)){
        $raw=stream_get_contents(STDIN,32769);if(strlen($raw)>32768)throw new RuntimeException('INPUT_TOO_LARGE');$input=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($input))throw new RuntimeException('INVALID_INPUT');Baize\Installer::install($input,baize_config_path());fwrite(STDOUT,"安装完成。\n");exit(0);
    }
    fwrite(STDOUT,
        "用法：\n".
        "  php bin/install.php --check        检查 PHP 版本、扩展、私有目录（可加 BAIZE_DB_* 顺带测库）\n".
        "  php bin/install.php --interactive  在终端里直接完成安装，不需要打开网页\n".
        "  php bin/install.php --prepare      只生成一次性安装凭据，再用浏览器打开 https://域名/install.php\n".
        "  自动化：php bin/install.php --stdin-json < payload.json\n".
        "注意：以上命令要以 PHP-FPM 的运行用户执行（例如 docker exec -u www-data），否则 private/ 会归 root 所有。\n");
}catch(Throwable $e){
    // CLI 运行在本机受信环境，必须把失败原因打出来；只返回类名会让排障无从下手。
    $message=$e->getMessage();
    $detail=$e instanceof Baize\HttpError?$e->errorCode.($message!==''&&$message!==$e->errorCode?': '.$message:''):trim(get_class($e).($message!==''?': '.$message:''));
    fwrite(STDERR,"安装未完成：".$detail."\n");
    if(preg_match('/INSTALL_DIRECTORY|PRIVATE_|MASTER_KEY|Permission denied/',$detail)===1){
        fwrite(STDERR,'提示：私有目录必须归 PHP 运行用户所有且为 0700，可在宿主机以 root 执行 '.baize_repair_command(dirname(baize_config_path()))."\n");
    }
    exit(1);

}
