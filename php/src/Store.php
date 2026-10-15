<?php
declare(strict_types=1);
namespace Baize;

final class Store
{
    public function __construct(public Database $db) {}
    public function get(string $kind,string $id): ?array { $row=$this->db->one('SELECT body FROM documents WHERE kind=? AND id=?',[$kind,$id]);return $row?json_decode($row['body'],true,512,JSON_THROW_ON_ERROR):null; }
    /** InnoDB current read: do not reuse an outer REPEATABLE READ snapshot for mutations. */
    public function getForUpdate(string $kind,string $id):?array
    {
        if(!$this->db->pdo->inTransaction())throw new \LogicException('Store::getForUpdate requires a transaction');
        $row=$this->db->one('SELECT body FROM documents WHERE kind=? AND id=? FOR UPDATE',[$kind,$id]);
        return $row?json_decode($row['body'],true,512,JSON_THROW_ON_ERROR):null;
    }
    public function put(string $kind,string $id,array $value,?string $siteId=null): void
    {
        $this->db->exec('INSERT INTO documents(kind,id,site_id,body,created_at,updated_at) VALUES(?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE site_id=VALUES(site_id),body=VALUES(body),updated_at=UTC_TIMESTAMP(6)',[$kind,$id,$siteId,json_encode($value,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_PRESERVE_ZERO_FRACTION)]);
    }
    public function delete(string $kind,string $id): void { $this->db->exec('DELETE FROM documents WHERE kind=? AND id=?',[$kind,$id]); }
    public function list(string $kind,?string $siteId=null): array
    {
        $rows=$siteId===null?$this->db->all('SELECT body FROM documents WHERE kind=? ORDER BY created_at,id',[$kind]):$this->db->all('SELECT body FROM documents WHERE kind=? AND site_id=? ORDER BY created_at,id',[$kind,$siteId]);
        return array_map(fn($r)=>json_decode($r['body'],true,512,JSON_THROW_ON_ERROR),$rows);
    }
    public static function uuid(): string { $b=random_bytes(16);$b[6]=chr((ord($b[6])&15)|64);$b[8]=chr((ord($b[8])&63)|128);$h=bin2hex($b);return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20); }
    public static function now(): string { return (new \DateTimeImmutable('now',new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'); }
}
