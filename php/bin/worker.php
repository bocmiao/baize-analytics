#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
$config=baize_config();$app=new \Baize\App($config);
$once=in_array('--once',$argv,true);$schedule=in_array('--schedule',$argv,true);$drain=in_array('--drain',$argv,true);
if($schedule)\Baize\Worker::schedule($app);
$stop=false;if(function_exists('pcntl_async_signals')){pcntl_async_signals(true);foreach([SIGTERM,SIGINT] as $signal)pcntl_signal($signal,static function()use(&$stop):void{$stop=true;});}
$worker=gethostname().':'.getmypid().':'.bin2hex(random_bytes(6));$processed=0;$failed=0;
do{if($stop)break;if(\Baize\UpdateBridge::maintenance()){if($once||$drain)break;usleep(100000);continue;}$result=\Baize\Worker::once($app,$worker);if($result['worked']){echo json_encode($result,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).PHP_EOL;$processed++;if($result['status']==='retry')$failed++;}elseif(!$once&&!$drain){usleep(500000);}if($once||$drain&&!$result['worked'])break;}while(true);
exit($failed?1:0);
