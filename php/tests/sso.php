<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use Baize\{App,Database,Store,Router,Http,HttpError,Security,SSO};
$port=(int)(getenv('BAIZE_TEST_DB_PORT')?:3307);$name='baize_sso_'.bin2hex(random_bytes(4));
$admin=new PDO('mysql:host=127.0.0.1;port='.$port,'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$admin->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
$dir=sys_get_temp_dir().'/'.$name;mkdir($dir,0700);$db=new Database(['dsn'=>'mysql:host=127.0.0.1;port='.$port.';dbname='.$name,'user'=>'root','password'=>'']);$db->migrate();
$config=['public_url'=>'https://analytics.example.test','data_dir'=>$dir,'key_dir'=>$dir,'master_key'=>random_bytes(32)];$app=new App($config,$db);$router=new Router();
$checks=0;$assert=static function(bool $ok,string $why)use(&$checks):void{if(!$ok)throw new RuntimeException($why);$checks++;};
$denied=static function(callable $fn,string $code)use($assert):void{try{$fn();throw new RuntimeException('Expected '.$code);}catch(HttpError $e){$assert($e->errorCode===$code,'Expected '.$code.', got '.$e->errorCode);}};
try{
    $user=['id'=>Store::uuid(),'email'=>'sso-admin@example.test','name'=>'管理员','is_admin'=>true,'password_hash'=>'irrelevant'];$app->store->put('users',$user['id'],$user);
    $raw='sso-administrator-fixture';$app->store->put('auth_sessions',Security::hashToken($raw),['token_hash'=>Security::hashToken($raw),'user_id'=>$user['id'],'expires_at'=>gmdate('c',time()+300)]);
    $headers=['cookie'=>'baize_session='.$raw];$providerCalls=0;
    SSO::register($app,$router,static function(string $url)use(&$providerCalls):array{$providerCalls++;if(str_starts_with($url,'https://qyapi.weixin.qq.com/cgi-bin/gettoken?'))return ['status'=>200,'text'=>'{"errcode":0,"access_token":"fixture-not-a-live-provider-key"}'];if(str_starts_with($url,'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?'))return ['status'=>200,'text'=>'{"errcode":0,"UserId":"approved-member"}'];throw new RuntimeException('Unexpected provider URL');});
    $denied(static fn()=>$router->dispatch(new Http('GET','/api/admin/sso/wecom',[],['authorization'=>'Bearer invalid'])),'admin_cookie_required');
    $settings=['corpId'=>'test-corp','agentId'=>'10001','secret'=>'local-fixture-secret','enabled'=>true,'mappings'=>[['externalId'=>'approved-member','userId'=>$user['id']]]];
    $result=$router->dispatch(new Http('PUT','/api/admin/sso/wecom',$settings,$headers));$assert($result['saved']===true,'SSO save');
    $visible=$router->dispatch(new Http('GET','/api/admin/sso/wecom',[],$headers));$assert(!str_contains(json_encode($visible),'local-fixture-secret')&&!str_contains(json_encode($visible),'encrypted'),'SSO read redacts secret');
    $invalid=$settings;$invalid['mappings'][]=$settings['mappings'][0];$denied(static fn()=>$router->dispatch(new Http('PUT','/api/admin/sso/wecom',$invalid,$headers)),'invalid_sso_mapping');
    $state=bin2hex(random_bytes(32));$binding='state-binding-fixture';$stateId=Security::hashToken($state);$app->store->put('sso_states',$stateId,['binding_hash'=>Security::hashToken($binding),'expires_at'=>gmdate('c',time()+300)]);
    $query=['code'=>'provider-code-fixture','state'=>$state];
    $denied(static fn()=>$router->dispatch(new Http('GET','/api/sso/wecom/callback',[],['cookie'=>'baize_sso=wrong'], $query)),'oauth_state_invalid');
    $assert($providerCalls===0,'Invalid binding must not call provider');
    $login=$router->dispatch(new Http('GET','/api/sso/wecom/callback',[],['cookie'=>'baize_sso='.$binding],$query));
    $assert($login['user']['id']===$user['id']&&!isset($login['user']['password_hash']),'Only approved existing account returned');$assert($providerCalls===2,'Two fixed provider requests');
    $assert($app->store->get('sso_states',$stateId)===null,'OAuth state consumed');
    $assert(count($app->store->list('auth_sessions'))===2,'One auth session created');
    $denied(static fn()=>$router->dispatch(new Http('GET','/api/sso/wecom/callback',[],['cookie'=>'baize_sso='.$binding],$query)),'oauth_state_invalid');
    $assert($providerCalls===2,'Replay must not repeat provider calls');
    $assert(count($app->store->list('users'))===1,'No SSO account created automatically');
    $sealed=Security::seal('compatibility-test',$config);$assert(Security::unseal($sealed,$config)==='compatibility-test','AES-GCM roundtrip');$envelope=json_decode($sealed,true);$envelope['tag']=str_repeat('0',32);try{Security::unseal(json_encode($envelope),$config);throw new RuntimeException('Tampered tag accepted');}catch(RuntimeException $e){$assert($e->getMessage()==='SECRET_AUTHENTICATION_FAILED','Tampered tag rejected');}
    echo json_encode(['suite'=>'sso','database'=>$db->one('SELECT VERSION() AS v')['v'],'passed'=>$checks,'provider'=>'injected fixture; no live credentials'],JSON_UNESCAPED_UNICODE)."\n";
}finally{$admin->exec('DROP DATABASE `'.$name.'`');@rmdir($dir);}
