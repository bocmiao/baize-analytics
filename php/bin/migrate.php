#!/usr/bin/env php
<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
try{$db=new Baize\Database(baize_config());$db->migrate();fwrite(STDOUT,"数据库迁移完成。\n");}
catch(Throwable $e){fwrite(STDERR,"迁移失败，请检查私有配置与数据库连接。\n");exit(1);}
