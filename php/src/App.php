<?php
declare(strict_types=1);
namespace Baize;
final class App
{
    public Database $db;public Store $store;public Auth $auth;public Router $router;
    public function __construct(public array $config,?Database $db=null)
    {
        $this->db=$db??new Database($config);$this->store=new Store($this->db);if(class_exists(Keyring::class))Keyring::initialize($this);$this->auth=new Auth($this);$this->router=new Router();
    }
    public function register():void
    {
        Auth::register($this,$this->router);Sites::register($this,$this->router);
        foreach(['Collect','Analytics','Governance','External','Operations','SSO','GeoIP','Diagnostics','ManualSearch','Mcp','Annotations','Keyring','Maintenance'] as $module){$class=__NAMESPACE__.'\\'.$module;if(class_exists($class))$class::register($this,$this->router);}
        $this->router->add('GET','/healthz',function(){ $this->db->one('SELECT 1');return ['ok'=>true,'database'=>'ready','runtime'=>'php','schemaVersion'=>1]; });
    }
    public function audit(string $actorId,?string $siteId,string $action,mixed $target):void
    {
        $id=Store::uuid();$this->store->put('audit_logs',$id,['id'=>$id,'actor_id'=>$actorId,'site_id'=>$siteId,'action'=>$action,'target'=>$target,'created_at'=>Store::now()],$siteId);
    }
    public function handle(Http $r):mixed{Security::csrf($r,$this->config);return $this->router->dispatch($r);}
    public function run():void
    {
        header('X-Content-Type-Options: nosniff');header('Referrer-Policy: strict-origin-when-cross-origin');header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");header('Cache-Control: no-store');
        try{$result=$this->handle(new Http());if($result!==null){header('Content-Type: application/json; charset=utf-8');echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);}}
        catch(HttpError $e){http_response_code($e->status);header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$e->errorCode,'code'=>$e->errorCode,'message'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);}
        catch(\Throwable $e){http_response_code(500);header('Content-Type: application/json; charset=utf-8');error_log('Baize PHP request failed: '.get_class($e));echo '{"error":"internal_error","message":"服务器未能完成请求，请检查私有运行日志"}';}
    }
}
