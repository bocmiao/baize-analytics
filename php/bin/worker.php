#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
$config=baize_config();$app=new \Baize\App($config);
$once=in_array('--once',$argv,true);$schedule=in_array('--schedule',$argv,true);$drain=in_array('--drain',$argv,true);
if($schedule)\Baize\Worker::schedule($app);
$worker=gethostname().':'.getmypid().':'.bin2hex(random_bytes(6));$processed=0;$failed=0;
do{$result=\Baize\Worker::once($app,$worker);if($result['worked']){echo json_encode($result,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).PHP_EOL;$processed++;if($result['status']==='retry')$failed++;}elseif(!$once&&!$drain){usleep(500000);}if($once||$drain&&!$result['worked'])break;}while(true);
exit($failed?1:0);
