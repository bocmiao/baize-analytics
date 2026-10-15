<?php
declare(strict_types=1);
namespace Baize;

class HttpError extends \RuntimeException
{
    public function __construct(public int $status,public string $errorCode,string $message=''){parent::__construct($message?:$errorCode);}
}
final class Http
{
    public array $body=[],$query=[],$params=[],$headers=[];
    public string $method,$path,$rawBody='';
    public function __construct(?string $method=null,?string $path=null,?array $body=null,array $headers=[],?array $query=null)
    {
        $this->method=strtoupper($method??$_SERVER['REQUEST_METHOD']??'GET');
        $this->path=parse_url($path??$_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/';
        foreach($headers?:((function_exists('getallheaders')?getallheaders():[])?:[]) as $key=>$value)$this->headers[strtolower($key)]=(string)$value;
        if(isset($_SERVER['CONTENT_TYPE'])&&!isset($this->headers['content-type']))$this->headers['content-type']=$_SERVER['CONTENT_TYPE'];
        $this->query=$query??$_GET;
        if($body!==null){$this->body=$body;$this->rawBody=json_encode($body,JSON_THROW_ON_ERROR);return;}
        if(in_array($this->method,['POST','PUT','PATCH','DELETE'],true)){
            $limit=preg_match('~^/api/sites/[^/]+/manual-search/(?:preview|commit)$~D',$this->path)?32*1048576:1048576;
            $raw=file_get_contents('php://input',false,null,0,$limit+1);if(strlen($raw)>$limit)self::error(413,'request_too_large');
            $encoding=$this->header('content-encoding');if($encoding==='gzip'){$raw=@gzdecode($raw,$limit+1);if($raw===false||strlen($raw)>$limit)self::error(400,'invalid_gzip');}elseif($encoding!==null&&$encoding!==''&&$encoding!=='identity')self::error(415,'unsupported_content_encoding');
            $this->rawBody=$raw?:'';
            // MCP owns JSON-RPC parse/batch error codes; transport limits still apply.
            if(preg_match('~^/api/sites/[^/]+/mcp/?$~D',$this->path))return;
            if($raw!==''&&$raw!==false){try{$decoded=$this->path==='/api/collect'&&class_exists(Collect::class)?Collect::decode($raw,''):json_decode($raw,true,512,JSON_THROW_ON_ERROR);}catch(\JsonException){self::error(400,'invalid_request','请求正文必须是 JSON');}if(!is_array($decoded)||($decoded!==[]&&array_is_list($decoded)))self::error(400,'invalid_request');$this->body=$decoded;}
        }
    }
    public function header(string $name):?string{return $this->headers[strtolower($name)]??null;}
    public function cookie(string $name):?string
    {
        if(isset($this->headers['cookie']))foreach(explode(';',$this->headers['cookie']) as $cookie){$parts=explode('=',trim($cookie),2);if(count($parts)===2&&$parts[0]===$name)return rawurldecode($parts[1]);}
        return isset($_COOKIE[$name])?(string)$_COOKIE[$name]:null;
    }
    public static function error(int $status,string $code,string $message=''):never{throw new HttpError($status,$code,$message);}
    public static function json(mixed $body,int $status=200,array $headers=[]):mixed{http_response_code($status);foreach($headers as $name=>$value)header($name.': '.$value);return $body;}
}
