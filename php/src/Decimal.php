<?php
declare(strict_types=1);
namespace Baize;

/** Arbitrary precision decimal addition. Money never passes through a binary sum. */
final class Decimal
{
    public static function normalize(string|int|float $value): string
    {
        $text = is_float($value) ? (string)json_encode($value, JSON_THROW_ON_ERROR) : (string)$value;
        if (!preg_match('/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/D', trim($text), $m)) {
            throw new \InvalidArgumentException('invalid_decimal');
        }
        $negative = $m[1] === '-';
        $whole = $m[2]; $fraction = $m[3] ?? ''; $exponent = (int)($m[4] ?? 0);
        if (abs($exponent) > 1000 || strlen($whole) + strlen($fraction) > 1000) {
            throw new \InvalidArgumentException('decimal_limit');
        }
        $digits = $whole . $fraction; $point = strlen($whole) + $exponent;
        if ($point <= 0) $text = '0.' . str_repeat('0', -$point) . $digits;
        elseif ($point >= strlen($digits)) $text = $digits . str_repeat('0', $point - strlen($digits));
        else $text = substr($digits, 0, $point) . '.' . substr($digits, $point);
        [$whole, $fraction] = array_pad(explode('.', $text, 2), 2, '');
        $whole = ltrim($whole, '0') ?: '0'; $fraction = rtrim($fraction, '0');
        return ($negative && ($whole !== '0' || $fraction !== '') ? '-' : '') . $whole . ($fraction !== '' ? '.' . $fraction : '');
    }

    public static function add(string|int|float $a, string|int|float $b): string
    {
        $a = self::normalize($a); $b = self::normalize($b);
        $an = str_starts_with($a, '-'); $bn = str_starts_with($b, '-');
        $a = ltrim($a, '-'); $b = ltrim($b, '-');
        [$aw, $af] = array_pad(explode('.', $a, 2), 2, '');
        [$bw, $bf] = array_pad(explode('.', $b, 2), 2, '');
        $scale = max(strlen($af), strlen($bf));
        $ad = ltrim($aw . str_pad($af, $scale, '0'), '0') ?: '0';
        $bd = ltrim($bw . str_pad($bf, $scale, '0'), '0') ?: '0';
        $negative = $an;
        if ($an === $bn) {
            $carry = 0; $digits = ''; $i = strlen($ad) - 1; $j = strlen($bd) - 1;
            while ($i >= 0 || $j >= 0 || $carry) {
                $n = ($i >= 0 ? (int)$ad[$i--] : 0) + ($j >= 0 ? (int)$bd[$j--] : 0) + $carry;
                $digits = ($n % 10) . $digits; $carry = intdiv($n, 10);
            }
        } else {
            $comparison = strlen($ad) <=> strlen($bd); if (!$comparison) $comparison = strcmp($ad, $bd);
            if (!$comparison) return '0';
            if ($comparison < 0) { [$ad, $bd] = [$bd, $ad]; $negative = $bn; }
            $borrow = 0; $digits = ''; $j = strlen($bd) - 1;
            for ($i = strlen($ad) - 1; $i >= 0; $i--) {
                $n = (int)$ad[$i] - ($j >= 0 ? (int)$bd[$j--] : 0) - $borrow;
                $borrow = $n < 0 ? 1 : 0; $digits = ($n < 0 ? $n + 10 : $n) . $digits;
            }
        }
        if ($scale) { $digits = str_pad($digits, $scale + 1, '0', STR_PAD_LEFT); $digits = substr($digits, 0, -$scale) . '.' . substr($digits, -$scale); }
        return self::normalize(($negative ? '-' : '') . $digits);
    }

    public static function compare(string|int|float $a, string|int|float $b): int
    {
        $difference = self::add($a, '-' . ltrim(self::normalize($b), '-'));
        if (str_starts_with(self::normalize($b), '-')) $difference = self::add($a, ltrim(self::normalize($b), '-'));
        return $difference === '0' ? 0 : (str_starts_with($difference, '-') ? -1 : 1);
    }

    public static function sum(array $values): string
    {
        $sum = '0'; foreach ($values as $value) $sum = self::add($sum, $value); return $sum;
    }
}
