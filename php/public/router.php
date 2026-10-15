<?php
declare(strict_types=1);
// Development only. Production must use the documented public/ web root.
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/');
$real=realpath(__DIR__.$path);
if($path!=='/'&&$real&&str_starts_with($real,__DIR__.DIRECTORY_SEPARATOR)&&is_file($real)&&!str_ends_with(strtolower($real),'.php')&&!preg_match('~(?:^|/)\.~',$path))return false;
require __DIR__.'/index.php';
