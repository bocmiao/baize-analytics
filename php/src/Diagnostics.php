<?php
declare(strict_types=1);
namespace Baize;

final class Diagnostics
{
    private static function directory(string $path):array
    {
        $stat=@lstat($path);return ['available'=>$stat!==false&&is_dir($path)&&!is_link($path)&&is_readable($path)&&is_writable($path),'private'=>$stat!==false&&($stat['mode']&0077)===0];
    }
    public static function deployment(App $app):array
    {
        $schema=$app->db->all('SELECT version FROM schema_migrations ORDER BY version');
        return ['profile'=>'standard','runtime'=>['phpVersion'=>PHP_VERSION,'platform'=>PHP_OS_FAMILY,'architecture'=>php_uname('m')],'storage'=>['backend'=>'mysql','available'=>true,'schemaVersion'=>count($schema)],'directories'=>['data'=>self::directory($app->config['data_dir']),'keys'=>self::directory($app->config['key_dir'])],'transport'=>['httpsConfigured'=>str_starts_with($app->config['public_url'],'https://'),'requestHttps'=>(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')||($_SERVER['SERVER_PORT']??'')==='443','certificateVerified'=>false],'supervision'=>['managedByThisWebPage'=>false],'limitations'=>['web_diagnostics_require_a_running_server','https_configuration_does_not_verify_certificate','service_supervision_is_operator_managed']];
    }
    public static function site(App $app,string $siteId):array
    {
        $site=$app->store->get('sites',$siteId);if(!$site)Http::error(404,'site_missing');$state=$app->store->get('aggregation_state',$siteId)??[];
        $jobs=$app->db->one("SELECT COUNT(*) AS n FROM documents WHERE kind='queue_jobs' AND site_id=?",[$siteId]);
        return ['siteId'=>$siteId,'database'=>['status'=>'ready','backend'=>'mysql'],'redis'=>['status'=>'disabled'],'storage'=>['authority'=>'mysql','body_mode'=>'retained_event_rebuild','physicalBytesStatus'=>'not_measured'],'settings'=>['retention_days'=>$site['retention_days'],'privacy_mode'=>$site['privacy_mode'],'timezone'=>$site['timezone']],'aggregation'=>array_intersect_key($state,array_flip(['watermark','generation','processed_generation','processed_events','sessions','updated_at'])),'queue'=>['jobs'=>(int)$jobs['n']],'geoip'=>GeoIP::status($app),'backup'=>['status'=>'not_verified_by_this_diagnostic'],'limitations'=>['私有凭据、连接串、路径、访客标识和事件正文不在此诊断中。','数据库可读不等于备份可恢复；使用隔离实例执行恢复测试。']];
    }
    public static function register(App $app,Router $router):void
    {
        $router->add('POST','/api/setup/diagnostics',static function(Http $r)use($app):array{
            $app->auth->attempt('setup_diagnostics');$state=Installer::prepare($app);
            if(($state['state']??'')==='pending')Installer::verifyNonce($app->config['key_dir'],(string)($r->body['installationNonce']??''),(string)$state['nonce_hash']);else $app->auth->admin($r);
            return self::deployment($app);
        });
        foreach(['','/export'] as $suffix)$router->add('GET','/api/v1/sites/:siteId/self-host-diagnostics'.$suffix,static function(Http $r)use($app,$suffix):array{
            $app->auth->authorize($r,$r->params['siteId'],'admin');header('Cache-Control: no-store');if($suffix!=='')header('Content-Disposition: attachment; filename="baize-diagnostics.json"');return self::site($app,$r->params['siteId']);
        });
        $router->add('GET','/api/capabilities',static fn(Http $r):array=>['profile'=>'standard','runtime'=>'php','reports'=>[],'capabilities'=>['database'=>'mysql','prebuiltFrontend'=>true,'nodePostgresInPlaceRestore'=>false]]);
    }
}
