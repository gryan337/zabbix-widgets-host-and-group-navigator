<?php declare(strict_types = 0);


/**
 * Host navigator widget form view.
 *
 * @var CView $this
 * @var array $data
 */

use Modules\HostAndGroupNavigator\Includes\CWidgetFieldHostGroupingView;

$form = new CWidgetFormView($data);

$groupids_field = array_key_exists('groupids', $data['fields'])
	? new CWidgetFieldMultiSelectGroupView($data['fields']['groupids'])
	: null;

$hosts_field = array_key_exists('hosts', $data['fields'])
	? (new CWidgetFieldPatternSelectHostView($data['fields']['hosts']))
		->setFilterPreselect([
			'id' => $groupids_field->getId(),
			'accept' => CMultiSelect::FILTER_PRESELECT_ACCEPT_ID,
			'submit_as' => 'groupid'
		])
	: null;

$form
	->addField($groupids_field)
	->addField($hosts_field)
	->addField(array_key_exists('status', $data['fields'])
		? new CWidgetFieldRadioButtonListView($data['fields']['status'])
		: null
	)
	->addField(array_key_exists('host_tags_evaltype', $data['fields'])
		? new CWidgetFieldRadioButtonListView($data['fields']['host_tags_evaltype'])
		: null
	)
	->addField(array_key_exists('host_tags', $data['fields'])
		? new CWidgetFieldTagsView($data['fields']['host_tags'])
		: null
	)
	->addField(
		new CWidgetFieldSeveritiesView($data['fields']['severities'])
	)
	->addField(
		new CWidgetFieldCheckBoxView($data['fields']['maintenance'])
	)
	->addField(
		(new CWidgetFieldCheckBoxView($data['fields']['use_cookies']))
			->setFieldHint(
				makeHelpIcon([
					_('If checked, selected hosts and groups will be stored in a cookie'), BR(), BR(),
					_('This is useful when switching between multiple dashboards or pages, '), BR(),
					_('allowing you to keep your last selected host or host group automatically '), BR(),
					_('via a cookie, without needing to reselect it.')
				])
			)
	)
	->addField(
		(new CWidgetFieldCheckBoxView($data['fields']['no_select_first_entry']))
			->setFieldHint(
				makeHelpIcon([
					_('By default, none of the host groups or hosts will be auto-selected when the widget loads for the first time')
				])
			)
	)
	->addField(
		(new CWidgetFieldCheckBoxView($data['fields']['host_groups_only']))
			->setFieldHint(
				makeHelpIcon([
					_('Option to only display the host groups and not hosts. Requires \'Group by\' => \'Host group\'')
				])
			)
	)
	->addField(
		new CWidgetFieldRadioButtonListView($data['fields']['problems'])
	)
	->addField(
		new CWidgetFieldHostGroupingView($data['fields']['group_by'])
	)
	->addField(array_key_exists('show_lines', $data['fields'])
		? new CWidgetFieldIntegerBoxView($data['fields']['show_lines'])
		: null
	)
	->show();
