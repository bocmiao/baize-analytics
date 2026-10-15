<?php
declare(strict_types=1);
namespace Baize;

use PDO;
use Throwable;

/** All writes and locks use InnoDB; no PostgreSQL-specific SQL is required. */
final class Database
{
    public PDO $pdo;
    private int $depth = 0;
    public function __construct(array|PDO $config)
    {
        if ($config instanceof PDO) { $this->pdo = $config; }
        else {
            $d = $config['database'] ?? $config;
            $dsn = $d['dsn'] ?? $config['database_dsn'] ?? $config['db_dsn'] ?? null;
            if (!$dsn || !str_starts_with($dsn, 'mysql:')) { throw new \RuntimeException('MySQL PDO DSN required'); }
            $this->pdo = new PDO($dsn, $d['user'] ?? $config['db_user'] ?? '', $d['password'] ?? $config['db_password'] ?? '', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false,PDO::MYSQL_ATTR_INIT_COMMAND=>"SET NAMES utf8mb4"]);
        }
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->exec("SET time_zone = '+00:00'");
    }
    public function all(string $sql, array $params=[]): array { $q=$this->pdo->prepare($sql);$q->execute($params);return $q->fetchAll(PDO::FETCH_ASSOC); }
    public function one(string $sql, array $params=[]): ?array { return $this->all($sql,$params)[0]??null; }
    public function exec(string $sql, array $params=[]): int { $q=$this->pdo->prepare($sql);$q->execute($params);return $q->rowCount(); }
    public function transaction(callable $fn): mixed
    {
        $level=$this->depth++;$point='baize_'.$level;
        try {
            if($level===0)$this->pdo->beginTransaction();else $this->pdo->exec("SAVEPOINT $point");
            $result=$fn($this);
            if($level===0)$this->pdo->commit();else $this->pdo->exec("RELEASE SAVEPOINT $point");
            return $result;
        } catch(Throwable $e) {
            if($this->pdo->inTransaction()){if($level===0)$this->pdo->rollBack();else $this->pdo->exec("ROLLBACK TO SAVEPOINT $point");}
            throw $e;
        } finally { $this->depth--; }
    }
    public function lock(string $name): void
    {
        if(!$this->pdo->inTransaction())throw new \LogicException('Database::lock requires a transaction');
        // An UPDATE on the duplicate takes an exclusive record lock immediately.
        // INSERT IGNORE would take shared locks and two callers could deadlock
        // while both subsequently upgrade with SELECT ... FOR UPDATE.
        $this->exec('INSERT INTO locks(name) VALUES(?) ON DUPLICATE KEY UPDATE name=VALUES(name)',[$name]);
        $this->one('SELECT name FROM locks WHERE name=? FOR UPDATE',[$name]);
    }
    public function migrate(): void
    {
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(191) PRIMARY KEY,applied_at DATETIME(6) NOT NULL) ENGINE=InnoDB');
        foreach(glob(dirname(__DIR__).'/migrations/*.sql')?:[] as $file){
            $version=basename($file);if($this->one('SELECT version FROM schema_migrations WHERE version=?',[$version]))continue;
            $sql=(string)file_get_contents($file);foreach(preg_split('/;\s*(?:\r?\n|$)/',$sql)?:[] as $statement){if(trim($statement)!=='')$this->pdo->exec($statement);}
            $this->exec('INSERT IGNORE INTO schema_migrations(version,applied_at) VALUES(?,UTC_TIMESTAMP(6))',[$version]);
        }
    }
}
