<?php declare(strict_types = 0);


namespace Modules\HostAndGroupNavigator;

use Zabbix\Core\CWidget;

class Widget extends CWidget {

	public function getDefaultName(): string {
		return _('Host and Hostgroup navigator');
	}

	public function getTranslationStrings(): array {
		return [
			'class.widget.js' => [
				'No data found' => _('No data found'),
				'Unexpected server error.' => _('Unexpected server error.')
			],
			'class.hostandgroupnavigator.js' => [
				'Uncategorized' => _('Uncategorized'),
				'%1$d of %1$d+ hosts are shown' => _('%1$d of %1$d+ hosts are shown'),
				'Host group' => _('Host group'),
				'Severity' => _('Severity')
			]
		];
	}
}
