<?php
declare(strict_types=1);
namespace Baize;

/** The encrypted document backup is complete only for the audited 001 layout. */
final class UpdateSchema
{
    /** Held by manual migration and updater backup; never a database DDL lock. */
    public static function lock(array $config)
    {
        $path=$config['data_dir'].'/schema-migration.lock';
        if(!file_exists($path)){try{Installer::privateWrite($path,'');}catch(\RuntimeException $e){if(!file_exists($path))throw $e;}}
        $s=lstat($path);if(is_link($path)||!is_file($path)||$s['nlink']!==1||($s['mode']&0077)!==0)throw new \RuntimeException('MIGRATION_LOCK_UNSAFE');
        $handle=fopen($path,'r+b');if(!$handle||!flock($handle,LOCK_EX|LOCK_NB))throw new \RuntimeException('MIGRATION_BUSY');return $handle;
    }
    public static function assertDocumentBackup(App $a):void
    {
        $expected=[
            'documents'=>['kind'=>['varchar(64)','NO','ascii','ascii_bin'],'id'=>['varchar(191)','NO','ascii','ascii_bin'],'site_id'=>['varchar(128)','YES','ascii','ascii_bin'],'body'=>['longtext','NO','utf8mb4','utf8mb4_bin'],'created_at'=>['datetime(6)','NO',null,null],'updated_at'=>['datetime(6)','NO',null,null]],
            'locks'=>['name'=>['varchar(191)','NO','ascii','ascii_bin']],
            'schema_migrations'=>['version'=>['varchar(191)','NO',null,null],'applied_at'=>['datetime(6)','NO',null,null]],
        ];
        $fail=static function():never{throw new \RuntimeException('UPDATE_PHP_DOCUMENT_BACKUP_SCOPE_UNSUPPORTED');};
        $tables=$a->db->all('SELECT TABLE_NAME,ENGINE,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
        if(array_column($tables,'TABLE_NAME')!==array_keys($expected))$fail();
        foreach($tables as $table)if(strtolower($table['ENGINE']??'')!=='innodb'||$table['TABLE_TYPE']!=='BASE TABLE')$fail();
        foreach($expected as $table=>$columns){
            $actual=$a->db->all('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[$table]);
            if(array_column($actual,'COLUMN_NAME')!==array_keys($columns))$fail();
            foreach($actual as $column){[$type,$nullable,$charset,$collation]=$columns[$column['COLUMN_NAME']];if(strtolower($column['COLUMN_TYPE'])!==$type||$column['IS_NULLABLE']!==$nullable||$column['EXTRA']!==''||($charset!==null&&$column['CHARACTER_SET_NAME']!==$charset)||($collation!==null&&$column['COLLATION_NAME']!==$collation))$fail();}
        }
        $indexes=[];foreach($a->db->all('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX') as $row){$indexes[$row['TABLE_NAME']][$row['INDEX_NAME']]['nonUnique']=(int)$row['NON_UNIQUE'];$indexes[$row['TABLE_NAME']][$row['INDEX_NAME']]['columns'][]=$row['COLUMN_NAME'];}
        if($indexes!=['documents'=>['PRIMARY'=>['nonUnique'=>0,'columns'=>['kind','id']],'documents_kind_site'=>['nonUnique'=>1,'columns'=>['kind','site_id']]],'locks'=>['PRIMARY'=>['nonUnique'=>0,'columns'=>['name']]],'schema_migrations'=>['PRIMARY'=>['nonUnique'=>0,'columns'=>['version']]]])$fail();
        foreach([['TRIGGERS','TRIGGER_SCHEMA'],['ROUTINES','ROUTINE_SCHEMA'],['EVENTS','EVENT_SCHEMA']] as [$table,$field])if((int)$a->db->one("SELECT COUNT(*) n FROM information_schema.$table WHERE $field=DATABASE()")['n']!==0)$fail();
        $constraints=$a->db->all("SELECT t.TABLE_NAME,t.CONSTRAINT_TYPE,c.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS t LEFT JOIN information_schema.CHECK_CONSTRAINTS c ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.CONSTRAINT_TYPE NOT IN ('PRIMARY KEY','UNIQUE')");
        if(count($constraints)!==1||$constraints[0]['TABLE_NAME']!=='documents'||$constraints[0]['CONSTRAINT_TYPE']!=='CHECK'||strtolower(preg_replace('/[\\s`()]/','',$constraints[0]['CHECK_CLAUSE']??''))!=='json_validbody')$fail();
    }
}
