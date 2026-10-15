<?php
declare(strict_types=1);
namespace Baize;
final class Router
{
    private array $routes=[];
    private array $inventory=[];
    public function add(string $method,string $path,callable $callback):void
    {
        $names=[];$quoted=preg_quote($path,'~');$pattern=preg_replace_callback('/\\\\:([A-Za-z][A-Za-z0-9_]*)/',function($m)use(&$names){$names[]=$m[1];return '([^/]+)';},$quoted);
        $this->routes[]=[strtoupper($method),'~^'.$pattern.'/?$~D',$names,$callback];
        $this->inventory[]=['method'=>strtoupper($method),'path'=>$path];
    }
    public function routes():array{return $this->inventory;}
    public function dispatch(Http $r):mixed
    {
        foreach($this->routes as [$method,$pattern,$names,$callback])if(($method===$r->method||($r->method==='HEAD'&&$method==='GET'))&&preg_match($pattern,$r->path,$matches)){
            array_shift($matches);$r->params=[];foreach($names as $i=>$name)$r->params[$name]=rawurldecode($matches[$i]);return $callback($r);
        }
        Http::error(404,'not_found','接口不存在');
    }
}
