<?php
declare(strict_types=1);
namespace Baize;

/** Runtime-specific operations report actual MySQL authority and operator-managed releases. */
final class Maintenance
{
    public static function storage(App $app,string $site):array
    {
        $s=$app->store->get('sites',$site);if(!$s)Http::error(404,'site_missing');$state=$app->store->get('aggregation_state',$site)??[];
        return ['configured'=>false,'authority'=>'mysql','runtime'=>'php','supportedReads'=>['retained events','session context','verified hourly aggregates','isolated historical namespaces'],'mode'=>'mysql','state'=>['mode'=>'mysql','generation'=>$state['generation']??0,'processed_generation'=>$state['processed_generation']??0,'watermark'=>$state['watermark']??null],'limitations'=>['此运行时使用MySQL；原Node版ClickHouse镜像和权威切换操作不适用于此数据库。','备份、恢复和迁移必须保留当前独立删除日志。']];
    }
    public static function register(App $app,Router $router):void
    {
        $router->add('GET','/api/admin/updates/status',static function(Http $r)use($app):array{return UpdateBridge::status($app,$r);});
        foreach(['check','apply','rollback'] as $action)$router->add('POST','/api/admin/updates/'.$action,static fn(Http $r):array=>UpdateBridge::command($app,$r,$action));
        $router->add('GET','/api/v1/sites/:siteId/storage',static function(Http $r)use($app):array{$app->auth->authorize($r,$r->params['siteId'],'admin');return self::storage($app,$r->params['siteId']);});
        foreach([['PUT','storage'],['POST','storage/replay']] as [$method,$path])$router->add($method,'/api/v1/sites/:siteId/'.$path,static function(Http $r)use($app):never{$app->auth->authorize($r,$r->params['siteId'],'admin');Http::error(409,'php_mysql_authority','当前运行时以MySQL为权威；不会创建虚假的ClickHouse副本状态。');});
        $router->add('GET','/api/v1/sites/:siteId/canonical',static function(Http $r)use($app):array{$app->auth->authorize($r,$r->params['siteId'],'admin');return ['authority'=>'mysql','configured'=>false,'body_mode'=>'retained_event_rebuild','actions'=>[],'message'=>'MySQL原始记录与已验证历史聚合；Node版ClickHouse权威迁移不适用。'];});
        $router->add('POST','/api/v1/sites/:siteId/canonical',static function(Http $r)use($app):never{$app->auth->authorize($r,$r->params['siteId'],'admin');Http::error(409,'php_mysql_authority','当前数据库使用MySQL事务和删除日志，不接受Node版ClickHouse迁移命令。');});
    }
}
