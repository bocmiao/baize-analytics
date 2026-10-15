<?php
declare(strict_types=1);
namespace Baize;
final class Auth
{
    public function __construct(private App $app){}
    public static function email(mixed $email):string{$email=strtolower(trim(is_string($email)?$email:''));if(strlen($email)>256||!filter_var($email,FILTER_VALIDATE_EMAIL))Http::error(400,'invalid_email','请输入有效邮箱');return $email;}
    public static function publicUser(array $u):array{return array_intersect_key($u,array_flip(['id','email','name','is_admin']));}
    public function createSession(array $user):string
    {
        $token=Security::randomToken();$hash=Security::hashToken($token);$this->app->store->put('auth_sessions',$hash,['token_hash'=>$hash,'user_id'=>$user['id'],'expires_at'=>gmdate('Y-m-d\TH:i:s\Z',time()+604800),'created_at'=>Store::now()]);
        if(!headers_sent())setcookie('baize_session',$token,['expires'=>time()+604800,'path'=>'/','httponly'=>true,'samesite'=>'Lax','secure'=>str_starts_with($this->app->config['public_url'],'https:')]);return $token;
    }
    public function user(Http $r):array
    {
        $authorization=$r->header('authorization');
        if($authorization!==null){
            if(!preg_match('/^Bearer ([A-Za-z0-9_-]{20,512})$/D',$authorization,$match))Http::error(401,'invalid_token');
            $hash=Security::hashToken($match[1]);$t=$this->token($hash);
            if(!$t||!hash_equals($t['token_hash']??'',$hash)||($t['revoked']??false)||(!empty($t['expires_at'])&&strtotime($t['expires_at'])<=time()))Http::error(401,'invalid_token','无效或已过期的 API Token');
            $id=$t['user_id'];
        }else{$raw=$r->cookie('baize_session');if(!$raw)Http::error(401,'login_required','请先登录');$session=$this->app->store->get('auth_sessions',Security::hashToken($raw));if(!$session||strtotime($session['expires_at'])<=time())Http::error(401,'session_expired','会话已失效');$id=$session['user_id'];}
        $u=$this->app->store->get('users',$id);if(!$u)Http::error(401,'session_expired');return self::publicUser($u);
    }
    public function authorize(Http $r,string $siteId,string $permission='read'):array
    {
        if(!in_array($permission,['read','write','admin'],true))throw new \LogicException('Unknown permission');$u=$this->user($r);
        if($r->header('authorization')!==null){$hash=Security::hashToken(substr($r->header('authorization'),7));$t=$this->token($hash);$scopes=$t['scopes']??[];
            if(($t['site_id']??'')!==$siteId||(!in_array($permission,$scopes,true)&&!in_array('admin',$scopes,true)&&!($permission==='read'&&in_array('write',$scopes,true))))Http::error(403,'token_scope_denied','Token 无此站点权限');}
        if(!$this->app->store->get('sites',$siteId))Http::error(404,'site_missing','站点不存在');$membership=$this->app->store->get('site_members',$siteId.':'.$u['id']);$role=$membership['role']??null;
        if(!($u['is_admin']??false)&&(!$role||($permission==='write'&&$role==='viewer')||($permission==='admin'&&!in_array($role,['owner','admin'],true))))Http::error(403,'site_permission_denied','无此站点权限');return $u;
    }
    public function admin(Http $r):array
    {
        if(!$r->cookie('baize_session')||$r->header('authorization')!==null)Http::error(403,'admin_cookie_required');$u=$this->user($r);if(!($u['is_admin']??false))Http::error(403,'instance_admin_required');return $u;
    }
    private function token(string $hash):?array
    {
        $index=$this->app->store->get('token_hashes',$hash);if($index){$token=$this->app->store->get('api_tokens',$index['id']);if($token)return $token;}
        foreach($this->app->store->list('api_tokens') as $token)if(hash_equals($token['token_hash']??'',$hash))return $token;return null;
    }
    public function attempt(string $kind,int $limit=10,int $seconds=60):void
    {
        $id=Security::hashToken($kind.':'.($_SERVER['REMOTE_ADDR']??'cli'));$this->app->db->transaction(function()use($id,$limit,$seconds){$this->app->db->lock('rate:'.$id);$a=$this->app->store->get('auth_attempts',$id);if(!$a||$a['start']+ $seconds<time())$a=['start'=>time(),'count'=>0];$a['count']++;$this->app->store->put('auth_attempts',$id,$a);});$a=$this->app->store->get('auth_attempts',$id);if($a['count']>$limit)Http::error(429,'login_rate_limited','尝试过多，请稍后再试');
    }
    public static function register(App $a,Router $router):void
    {
        $router->add('GET','/api/setup',function()use($a){$state=Installer::prepare($a);$pending=($state['state']??'')==='pending';return ['required'=>$pending,'credentialRequired'=>$pending,'state'=>$state['state'],'blocked'=>!$pending&&in_array($state['state'],['restored_blocked'],true)];});
        $router->add('POST','/api/setup',function(Http $r)use($a){if($r->header('authorization')!==null)Http::error(403,'admin_cookie_required');$a->auth->attempt('setup');Installer::prepare($a);$user=Installer::claim($a,$r->body);$a->auth->createSession($user);return ['user'=>self::publicUser($user)];});
        $router->add('POST','/api/login',function(Http $r)use($a){$a->auth->attempt('login');$email=self::email($r->body['email']??'');$password=(string)($r->body['password']??'');Security::validatePassword($password);$index=$a->store->get('user_emails',Security::hashToken($email));$u=$index?$a->store->get('users',$index['user_id']):null;
            if(!$u){foreach($a->store->list('users') as $candidate)if(strtolower($candidate['email'])===$email){$u=$candidate;break;}}
            $valid=Security::verifyPassword($password,$u['password_hash']??'php-sha384:$2y$10$wgXeIqs47rWvzwXtyvWctODj3K66nM29kLTm67Gr4hHd.qzy9W0TO');if(!$u||!$valid)Http::error(401,'invalid_credentials','邮箱或密码错误');
            $a->auth->createSession($u);return ['user'=>self::publicUser($u)];});
        $router->add('POST','/api/logout',function(Http $r)use($a){$raw=$r->cookie('baize_session');if($raw)$a->store->delete('auth_sessions',Security::hashToken($raw));if(!headers_sent())setcookie('baize_session','',['expires'=>time()-3600,'path'=>'/','httponly'=>true,'samesite'=>'Lax','secure'=>str_starts_with($a->config['public_url'],'https:')]);return ['ok'=>true];});
        $router->add('GET','/api/me',fn(Http $r)=>['user'=>$a->auth->user($r)]);
    }
}
