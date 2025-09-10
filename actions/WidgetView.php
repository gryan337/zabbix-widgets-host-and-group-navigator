<?php declare(strict_types = 0);


namespace Modules\HostAndGroupNavigator\Actions;

use API,
	CArrayHelper,
	CControllerDashboardWidgetView,
	CControllerResponseData,
	CProfile,
	CSeverityHelper;

use Modules\HostAndGroupNavigator\Includes\{
	CWidgetFieldHostGrouping,
	WidgetForm
};

class WidgetView extends CControllerDashboardWidgetView {

	protected function init(): void {
		parent::init();

		$this->addValidationRules([
			'with_config' =>	'in 1',
			'widgetid' =>		'db widget.widgetid',
			'fields' =>			'array'
		]);
	}

	protected function doAction(): void {
		$data = [
			'name' => $this->getInput('name', $this->widget->getDefaultName()),
			'user' => [
				'debug_mode' => $this->getDebugMode()
			],
			'vars' => $this->getHosts()
		];

		if ($this->hasInput('with_config')) {
			$data['vars']['config'] = $this->getConfig($this->hasInput('widgetid')
				? $this->getInput('widgetid')
				: null
			);
		}

		$this->setResponse(new CControllerResponseData($data));
	}

	private function getHosts(): array {
		$no_data = [
			'hosts' => [],
			'is_limit_exceeded' => false,
			'maintenances' => []
		];

		$override_hostid = $this->fields_values['override_hostid'] ? $this->fields_values['override_hostid'][0] : '';

		if ($override_hostid === '' && $this->isTemplateDashboard()) {
			return $no_data;
		}

		if (!$this->isTemplateDashboard()) {
			$c_flds = $this->fields_values;
			if (!$c_flds['groupids'] && !$c_flds['hosts'] && !$c_flds['host_tags'] && !$c_flds['host_groups_only']) {
				return $no_data;
			}
		}

		$is_show_in_maintenance_on = $this->fields_values['maintenance'] == 1;

		$output = $is_show_in_maintenance_on
			? ['hostid', 'name', 'status', 'maintenanceid', 'maintenance_status', 'groupid']
			: ['hostid', 'name', 'groupid'];

		$group_by_host_groups = false;
		$group_by_severity = $this->fields_values['problems'] != WidgetForm::PROBLEMS_NONE;
		$tags_to_keep = [];

		foreach ($this->fields_values['group_by'] as $group_by_attribute) {
			switch ($group_by_attribute['attribute']) {
				case CWidgetFieldHostGrouping::GROUP_BY_TAG_VALUE:
					$tags_to_keep[] = $group_by_attribute['tag_name'];
					break;
				case CWidgetFieldHostGrouping::GROUP_BY_HOST_GROUP:
					$group_by_host_groups = true;
					break;
				case CWidgetFieldHostGrouping::GROUP_BY_SEVERITY:
					$group_by_severity = true;
					break;
			}
		}

		$hosts = [];
		$groupids = $this->fields_values['groupids']
			? getSubgroups($this->fields_values['groupids'])
			: null;

		$exclude_groupids = $this->fields_values['exclude_groupids']
			? getSubgroups($this->fields_values['exclude_groupids'])
			: null;


		if ($override_hostid === '' && !$this->isTemplateDashboard()) {

			// Get hosts from host pattern and search narrowing criteria.
			$hosts = API::Host()->get([
				'output' => ['groupid'],
				'groupids' => $groupids,
				'evaltype' => $this->fields_values['host_tags_evaltype'],
				'tags' => $this->fields_values['host_tags'] ?: null,
				'search' => [
					'name' => in_array('*', $this->fields_values['hosts'], true) ? null : $this->fields_values['hosts']
				],
				'searchByAny' => true,
				'searchWildcardsEnabled' => true,
				'severities' => $this->fields_values['severities'] ?: null,
				'preservekeys' => true,
				'selectHostGroups' => ['groupid']
			]);

			if (!$hosts) {
				return $no_data;
			}

			// Get additional info for narrowed down hosts and filter them by status and maintenance status.
			$hosts = API::Host()->get([
				'output' => $output,
				'hostids' => array_keys($hosts),
				'filter' => [
					'status' => $this->fields_values['status'] == WidgetForm::HOST_STATUS_ANY
						? null
						: $this->fields_values['status'],
					'maintenance_status' => $is_show_in_maintenance_on ? null : HOST_MAINTENANCE_STATUS_OFF
				],
				'selectHostGroups' => $group_by_host_groups ? ['groupid', 'name'] : null,
				'selectTags' => $tags_to_keep ? ['tag', 'value'] : null,
				'sortfield' => 'name',
				// Request more than the set limit to distinguish if there are even more hosts available.
				'limit' => $this->fields_values['show_lines'] + 1
			]);
		}
		elseif ($override_hostid !== '') {
			$hosts = API::Host()->get([
				'output' => $output,
				'hostids' => [$override_hostid],
				'severities' => $this->fields_values['severities'] ?: null,
				'filter' => [
					'maintenance_status' => $is_show_in_maintenance_on ? null : HOST_MAINTENANCE_STATUS_OFF
				],
				'selectHostGroups' => $group_by_host_groups ? ['groupid', 'name'] : null,
				'selectTags' => $tags_to_keep ? ['tag', 'value'] : null
			]);
		}

		if (!$hosts) {
			return $no_data;
		}

		if ($exclude_groupids) {
			foreach ($hosts as $host_index => $host) {
				$hostgroups = [];
				if (isset($host['hostgroups']) && is_array($host['hostgroups'])) {
					foreach ($host['hostgroups'] as &$hg) {
						if (in_array($hg['groupid'], $exclude_groupids)) {
							unset($hg['groupid']);
						}
						else {
							$hostgroups[] = $hg;
							unset($hg);
						}
						$hosts[$host_index]['hostgroups'] = $hostgroups;
					}
				}
			}
		}

		CArrayHelper::sort($hosts, ['name']);
		$hosts = array_values($hosts);

		$hostgroup_names = [];
		foreach ($hosts as $host) {
			if (isset($host['hostgroups']) && is_array($host['hostgroups'])) {
				foreach ($host['hostgroups'] as $hostgroup) {
					if (isset($hostgroup['name']) && strpos($hostgroup['name'], '/')) {
						$last_pos = strrpos($hostgroup['name'], '/');
						$hostgroup_names[] = substr($hostgroup['name'], 0, $last_pos);
					}
				}
			}
		}
		$unique_hostgroup_names = array_unique($hostgroup_names);

		$hostgroups_to_check = [];

		foreach ($unique_hostgroup_names as $input) {
			$parts = explode('/', $input);
			$current_path = '';

			foreach ($parts as $part) {
				if ($current_path !== '') {
					$current_path .= '/';
				}
				$current_path .= $part;
				$hostgroups_to_check[] = $current_path;
			}
		}

		$all_hostgroups = API::Hostgroup()->get([
			'output' => ['groupid', 'name'],
			'filter' => [
				'name' => array_values($hostgroups_to_check)
			]
		]);

		if ($group_by_host_groups) {
			foreach ($hosts as &$host) {
				$extra_groups = [];

				foreach ($host['hostgroups'] as $hostgroup) {
					foreach ($all_hostgroups as $group) {
						if ($this->containsSubstring($hostgroup['name'], $group['name'])) {
							$extra_groups[] = $group;
						}
					}
				}
				$host['extra_groups'] = $extra_groups;
			}
			unset($host);
		}

		$is_limit_exceeded = false;

		if (!$this->isTemplateDashboard() && count($hosts) > $this->fields_values['show_lines']) {
			$is_limit_exceeded = true;

			array_pop($hosts);
		}

		if ($group_by_severity) {
			// Select triggers and problems to calculate number of problems for each host.
			$triggers = API::Trigger()->get([
				'output' => [],
				'selectHosts' => ['hostid'],
				'hostids' => array_column($hosts, 'hostid'),
				'skipDependent' => true,
				'monitored' => true,
				'preservekeys' => true
			]);

			$problems = API::Problem()->get([
				'output' => ['eventid', 'objectid', 'severity'],
				'source' => EVENT_SOURCE_TRIGGERS,
				'object' => EVENT_OBJECT_TRIGGER,
				'objectids' => array_keys($triggers),
				'suppressed' => $this->fields_values['problems'] == WidgetForm::PROBLEMS_UNSUPPRESSED ? false : null,
				'severities' => $this->fields_values['severities'] ?: null,
				'symptom' => false
			]);

			// Group all problems per host per severity.
			$host_problems = [];

			foreach ($problems as $problem) {
				foreach ($triggers[$problem['objectid']]['hosts'] as $trigger_host) {
					$host_problems[$trigger_host['hostid']][$problem['severity']][$problem['eventid']] = true;
				}
			}
		}

		$maintenanceids = [];

		if ($group_by_severity || $is_show_in_maintenance_on || $tags_to_keep || $group_by_host_groups) {
			foreach ($hosts as &$host) {
				if ($tags_to_keep) {
					$host['tags'] = array_values(array_filter($host['tags'], function($tag) use ($tags_to_keep) {
						return in_array($tag['tag'], $tags_to_keep, true);
					}));
				}

				if ($group_by_severity) {
					$host['problem_count'] = array_fill(TRIGGER_SEVERITY_NOT_CLASSIFIED, TRIGGER_SEVERITY_COUNT, 0);

					// Count the number of problems (as value) per severity (as key).
					if ($host_problems && array_key_exists($host['hostid'], $host_problems)) {
						foreach ($host_problems[$host['hostid']] as $severity => $problems) {
							$host['problem_count'][$severity] = count($problems);
						}
					}
				}

				if ($is_show_in_maintenance_on) {
					if ($host['status'] == HOST_STATUS_MONITORED
							&& $host['maintenance_status'] == HOST_MAINTENANCE_STATUS_ON) {
						$maintenanceids[$host['maintenanceid']] = true;
					}
					else {
						unset($host['maintenanceid']);
					}
					unset($host['maintenance_status'], $host['status']);
				}

				if ($group_by_host_groups && $override_hostid === '' && !$this->isTemplateDashboard()
						&& $groupids !== null) {
					$host['hostgroups'] = array_values(
						array_filter($host['hostgroups'], function($group) use ($groupids) {
							return in_array($group['groupid'], $groupids);
						})
					);
				}
			}
			unset($host);
		}

		if ($maintenanceids) {
			$maintenances = API::Maintenance()->get([
				'output' => ['name', 'maintenance_type', 'description', 'groupid'],
				'maintenanceids' => array_keys($maintenanceids),
				'preservekeys' => true
			]);

			foreach ($maintenances as &$maintenance) {
				$maintenance['maintenance_type'] = (int) $maintenance['maintenance_type'];

				unset($maintenance['maintenanceid']);
			}
			unset($maintenance);
		}
		else {
			$maintenances = [];
		}

		return [
			'hosts' => $hosts,
			'is_limit_exceeded' => $is_limit_exceeded,
			'maintenances' => $maintenances
		];
	}

	private function getConfig(?string $widgetid = null): array {
		$open_groups = [];

		if ($widgetid !== null) {
			$open_groupids = CProfile::findByIdxPattern('web.dashboard.widget.open.%', $widgetid);

			foreach ($open_groupids as $open_groupid) {
				$open_group = CProfile::get($open_groupid, null, $widgetid);

				if ($open_group !== null) {
					$open_groups[] = $open_group;
				}
			}
		}

		$severities = [];

		if ($this->fields_values['problems'] != WidgetForm::PROBLEMS_NONE
				|| in_array(CWidgetFieldHostGrouping::GROUP_BY_SEVERITY,
					array_column($this->fields_values['group_by'], 'attribute')
				)) {
			$severities = CSeverityHelper::getSeverities();

			foreach ($severities as &$severity) {
				$severity['status_style'] = CSeverityHelper::getStatusStyle($severity['value']);
			}
			unset($severity);
		}

		return [
			'group_by' => $this->fields_values['group_by'],
			'open_groups' => $open_groups,
			'show_problems' => $this->fields_values['problems'] != WidgetForm::PROBLEMS_NONE,
			'severities' => $severities
		];
	}

	private function containsSubstring($string, $substring) {
		return strpos($string, $substring) !== false;
	}
}
