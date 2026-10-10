<?php
/* Plugin Name: Baize Analytics
 * Description: Embed your privately hosted Baize tracker with consent support.
 * Version: 0.1.0
 * License: AGPL-3.0-only
 */
if (!defined('ABSPATH')) { exit; }
add_action('admin_init', function () {
 register_setting('baize', 'baize_endpoint', ['sanitize_callback' => 'esc_url_raw']);
 register_setting('baize', 'baize_site_id', ['sanitize_callback' => 'sanitize_text_field']);
 register_setting('baize', 'baize_consent', ['sanitize_callback' => function($v) { return $v ? '1' : '0'; }]);
});
add_action('admin_menu', function () {
 add_options_page('白泽统计', '白泽统计', 'manage_options', 'baize', function () {
  if (!current_user_can('manage_options')) { return; }
  echo '<div class="wrap"><h1>白泽自托管统计</h1><form method="post" action="options.php">';
  settings_fields('baize');
  echo '<p>白泽地址 <input name="baize_endpoint" type="url" value="'.esc_attr(get_option('baize_endpoint','')).'"></p>';
  echo '<p>站点 ID <input name="baize_site_id" value="'.esc_attr(get_option('baize_site_id','')).'"></p>';
  echo '<p><label><input type="checkbox" name="baize_consent" value="1" '.checked(get_option('baize_consent','1'),'1',false).'>要求同意后采集</label></p>';
  submit_button(); echo '</form></div>';
 });
});
add_action('wp_footer', function () {
 $endpoint=get_option('baize_endpoint',''); $site=get_option('baize_site_id','');
 if (!$endpoint || !$site || current_user_can('manage_options')) { return; }
 echo '<script defer src="'.esc_url(rtrim($endpoint,'/').'/tracker.js').'" data-site-id="'.esc_attr($site).'" data-api-host="'.esc_url($endpoint).'" data-consent-required="'.(get_option('baize_consent','1')==='1'?'true':'false').'"></script>';
});
