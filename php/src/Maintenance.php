<?php
declare(strict_types=1);
namespace Baize;

/** Runtime-specific operations report actual MySQL authority and operator-managed releases. */
final class Maintenance
{
    public static function status(App $app):array
    {
        $path=dirname(__DIR__).'/php-release-manifest.json';$manifest=is_file($path)?json_decode(file_get_contents($path),true,64,JSON_THROW_ON_ERROR):[];
        return ['runtime'=>'php','profile'=>'standard','phase'=>'idle','configured'=>false,'deploymentMode'=>'php-fpm','mechanism'=>'manual-package','reason'=>'PHP_OPERATOR_PACKAGE_UPGRADE','current'=>['revision'=>$manifest['revision']??null,'manifestSha256'=>is_file($path)?hash_file('sha256',$path):null],'schemaVersion'=>count($app->db->all('SELECT version FROM schema_migrations')),'instructions'=>['先在隔离实例验证新包与备份恢复，再进入维护窗口。','由主机操作者切换已校验的完整PHP包，并以同一网站用户执行 bin/upgrade.php。','回滚代码保留当前数据库和更新的独立删除日志；不自动覆盖为旧快照。']];
    }
    public static function storage(App $app,string $site):array
    {
        $s=$app->store->get('sites',$site);if(!$s)Http::error(404,'site_missing');$state=$app->store->get('aggregation_state',$site)??[];
        return ['configured'=>false,'authority'=>'mysql','runtime'=>'php','supportedReads'=>['retained events','session context','verified hourly aggregates','isolated historical namespaces'],'mode'=>'mysql','state'=>['mode'=>'mysql','generation'=>$state['generation']??0,'processed_generation'=>$state['processed_generation']??0,'watermark'=>$state['watermark']??null],'limitations'=>['此运行时使用MySQL；原Node版ClickHouse镜像和权威切换操作不适用于此数据库。','备份、恢复和迁移必须保留当前独立删除日志。']];
    }
    public static function register(App $app,Router $router):void
    {
        $router->add('GET','/api/admin/updates/status',static function(Http $r)use($app):array{$app->auth->admin($r);return self::status($app);});
        foreach(['check','apply','rollback'] as $action)$router->add('POST','/api/admin/updates/'.$action,static function(Http $r)use($app):never{$app->auth->admin($r);Http::error(409,'PHP_OPERATOR_PACKAGE_UPGRADE','PHP版由主机操作者校验并切换安装包；原Node增量执行器不能修改此运行时。');});
        $router->add('GET','/api/v1/sites/:siteId/storage',static function(Http $r)use($app):array{$app->auth->authorize($r,$r->params['siteId'],'admin');return self::storage($app,$r->params['siteId']);});
        foreach([['PUT','storage'],['POST','storage/replay']] as [$method,$path])$router->add($method,'/api/v1/sites/:siteId/'.$path,static function(Http $r)use($app):never{$app->auth->authorize($r,$r->params['siteId'],'admin');Http::error(409,'php_mysql_authority','当前运行时以MySQL为权威；不会创建虚假的ClickHouse副本状态。');});
        $router->add('GET','/api/v1/sites/:siteId/canonical',static function(Http $r)use($app):array{$app->auth->authorize($r,$r->params['siteId'],'admin');return ['authority'=>'mysql','configured'=>false,'body_mode'=>'retained_event_rebuild','actions'=>[],'message'=>'MySQL原始记录与已验证历史聚合；Node版ClickHouse权威迁移不适用。'];});
        $router->add('POST','/api/v1/sites/:siteId/canonical',static function(Http $r)use($app):never{$app->auth->authorize($r,$r->params['siteId'],'admin');Http::error(409,'php_mysql_authority','当前数据库使用MySQL事务和删除日志，不接受Node版ClickHouse迁移命令。');});
    }
}
