<?php
declare(strict_types=1);
namespace Baize;

/** Enterprise identities are bound only to administrator-approved existing accounts. */
final class SSO
{
    public static function register(App $app, Router $router, ?callable $transport=null): void
    {
        $transport ??= static fn(string $url):array => Outbound::request($url);
        $settings=static function() use($app):array {
            $row=$app->store->get('sso_config','wecom');
            if(!$row||!($row['settings']['enabled']??false)||!str_starts_with($app->config['public_url'],'https://'))Http::error(409,'sso_not_configured');
            return $row;
        };
        $router->add('GET','/api/sso',static fn(Http $r):array=>['wecom'=>(bool)($app->store->get('sso_config','wecom')['settings']['enabled']??false)]);
        $router->add('GET','/api/admin/sso/wecom',static function(Http $r) use($app):array {
            $app->auth->admin($r);$row=$app->store->get('sso_config','wecom');
            return ['config'=>$row?['settings'=>$row['settings'],'updated_at'=>$row['updated_at']]:null,'mappings'=>array_map(static fn($v)=>['external_id'=>$v['external_id'],'user_id'=>$v['user_id']],$app->store->list('sso_mappings'))];
        });
        $router->add('PUT','/api/admin/sso/wecom',static function(Http $r)use($app):array {
            $actor=$app->auth->admin($r);$b=$r->body;
            if(!is_string($b['corpId']??null)||strlen($b['corpId'])<1||strlen($b['corpId'])>100||!preg_match('/^\d{1,100}$/D',(string)($b['agentId']??''))||!is_bool($b['enabled']??null)||!is_array($b['mappings']??null)||count($b['mappings'])>1000)Http::error(400,'invalid_request');
            $secret=$b['secret']??'';if(!is_string($secret)||strlen($secret)>2000)Http::error(400,'invalid_request');
            $app->db->transaction(static function()use($app,$b,$secret,$actor):void {
                $app->db->lock('sso:configure');$prior=$app->store->get('sso_config','wecom');
                if($secret===''&&!$prior)Http::error(400,'sso_secret_required');
                $seen=[];foreach($b['mappings'] as $m){if(!is_array($m)||!is_string($m['externalId']??null)||strlen($m['externalId'])<1||strlen($m['externalId'])>200||!is_string($m['userId']??null)||!$app->store->get('users',$m['userId'])||isset($seen[$m['externalId']]))Http::error(400,'invalid_sso_mapping');$seen[$m['externalId']]=true;}
                $app->store->put('sso_config','wecom',['settings'=>['corpId'=>$b['corpId'],'agentId'=>$b['agentId'],'enabled'=>$b['enabled']],'encrypted'=>$secret!==''?Security::seal($secret,$app->config):$prior['encrypted'],'updated_at'=>Store::now()]);
                foreach($app->db->all('SELECT id FROM documents WHERE kind=?',['sso_mappings']) as $row)$app->store->delete('sso_mappings',$row['id']);
                foreach($b['mappings'] as $m)$app->store->put('sso_mappings',hash('sha256',$m['externalId']),['provider'=>'wecom','external_id'=>$m['externalId'],'user_id'=>$m['userId']]);
                $app->audit($actor['id'],null,'sso.configure',['provider'=>'wecom','mappingCount'=>count($b['mappings'])]);
            });return ['saved'=>true];
        });
        $router->add('GET','/api/sso/wecom/start',static function(Http $r)use($app,$settings):array {
            $c=$settings();$state=bin2hex(random_bytes(32));$binding=bin2hex(random_bytes(32));
            $app->store->put('sso_states',Security::hashToken($state),['binding_hash'=>Security::hashToken($binding),'expires_at'=>gmdate('c',time()+600)]);
            setcookie('baize_sso',$binding,['expires'=>time()+600,'path'=>'/api/sso/wecom','httponly'=>true,'secure'=>true,'samesite'=>'Lax']);
            $params=http_build_query(['appid'=>$c['settings']['corpId'],'agentid'=>$c['settings']['agentId'],'redirect_uri'=>rtrim($app->config['public_url'],'/').'/api/sso/wecom/callback','state'=>$state],'','&',PHP_QUERY_RFC3986);
            return ['url'=>'https://open.work.weixin.qq.com/wwopen/sso/qrConnect?'.$params];
        });
        $router->add('GET','/api/sso/wecom/callback',static function(Http $r)use($app,$settings,$transport):array {
            $code=$r->query['code']??'';$state=$r->query['state']??'';
            if(!is_string($code)||strlen($code)<1||strlen($code)>2000||!is_string($state)||!preg_match('/^[a-f0-9]{64}$/D',$state))Http::error(400,'oauth_state_invalid');
            $app->db->transaction(static function()use($app,$state,$r):void {
                $id=Security::hashToken($state);$app->db->lock('sso:'.$id);$entry=$app->store->get('sso_states',$id);
                if(!$entry||strtotime($entry['expires_at'])<=time()||!hash_equals($entry['binding_hash'],Security::hashToken($r->cookie('baize_sso')??'')))Http::error(403,'oauth_state_invalid');
                $app->store->delete('sso_states',$id);
            });
            setcookie('baize_sso','',['expires'=>time()-3600,'path'=>'/api/sso/wecom','httponly'=>true,'secure'=>true,'samesite'=>'Lax']);
            $c=$settings();$secret=Security::unseal($c['encrypted'],$app->config);
            try{
                $tokenResponse=$transport('https://qyapi.weixin.qq.com/cgi-bin/gettoken?'.http_build_query(['corpid'=>$c['settings']['corpId'],'corpsecret'=>$secret]));
                $token=self::providerJson($tokenResponse);if(empty($token['access_token']))Http::error(502,'external_response_invalid');
                $identity=self::providerJson($transport('https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?'.http_build_query(['access_token'=>$token['access_token'],'code'=>$code])));
            }catch(HttpError $e){throw $e;}catch(\Throwable){Http::error(502,'external_provider_failed');}
            if(!is_string($identity['UserId']??null)||$identity['UserId']==='')Http::error(403,'sso_identity_denied');
            return $app->db->transaction(static function()use($app,$identity,$c):array {
                $app->db->lock('sso:configure');$current=$app->store->get('sso_config','wecom');
                if(!$current||!($current['settings']['enabled']??false)||$current['updated_at']!==$c['updated_at']||$current['settings']!==$c['settings']||!hash_equals($current['encrypted'],$c['encrypted']))Http::error(403,'sso_identity_denied');
                $mapped=$app->store->get('sso_mappings',hash('sha256',$identity['UserId']));$user=$mapped?$app->store->get('users',$mapped['user_id']):null;
                if(!$user)Http::error(403,'sso_identity_denied');
                $session=bin2hex(random_bytes(32));$app->store->put('auth_sessions',Security::hashToken($session),['token_hash'=>Security::hashToken($session),'user_id'=>$user['id'],'expires_at'=>gmdate('c',time()+604800),'created_at'=>Store::now()]);
                setcookie('baize_session',$session,['expires'=>time()+604800,'path'=>'/','httponly'=>true,'secure'=>true,'samesite'=>'Lax']);
                $app->audit($user['id'],null,'sso.login',['provider'=>'wecom']);
                return ['user'=>array_intersect_key($user,array_flip(['id','email','name','is_admin']))];
            });
        });
    }
    private static function providerJson(array $response):array
    {
        if(($response['status']??0)!==200)Http::error(502,'external_provider_failed');
        try{$body=json_decode((string)($response['text']??''),true,32,JSON_THROW_ON_ERROR);}catch(\Throwable){Http::error(502,'external_response_invalid');}
        if(!is_array($body)||!empty($body['errcode']))Http::error(502,'external_response_invalid');return $body;
    }
}
