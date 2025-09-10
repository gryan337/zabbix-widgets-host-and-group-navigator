<?php declare(strict_types = 0);


namespace Modules\HostAndGroupNavigator\Includes;

use Zabbix\Widgets\{
	CWidgetField,
	CWidgetForm
};

use Zabbix\Widgets\Fields\{
	CWidgetFieldCheckBox,
	CWidgetFieldPatternSelectHost,
	CWidgetFieldIntegerBox,
	CWidgetFieldMultiSelectGroup,
	CWidgetFieldMultiSelectOverrideHost,
	CWidgetFieldRadioButtonList,
	CWidgetFieldSeverities,
	CWidgetFieldTags
};

use Modules\HostAndGroupNavigator\Includes\CWidgetFieldHostGrouping;

/**
 * Host navigator widget form.
 */
class WidgetForm extends CWidgetForm {

	public const HOST_STATUS_ANY = -1;
	public const HOST_STATUS_ENABLED = 0;
	public const HOST_STATUS_DISABLED = 1;

	public const PROBLEMS_ALL = 0;
	public const PROBLEMS_UNSUPPRESSED = 1;
	public const PROBLEMS_NONE = 2;

	private const LINES_MIN = 1;
	private const LINES_MAX = 50000;
	private const LINES_DEFAULT = 100;

	public function addFields(): self {
		return $this
			->addField($this->isTemplateDashboard()
				? null
				: new CWidgetFieldMultiSelectGroup('groupids', _('Host groups'))
			)
			->addField($this->isTemplateDashboard()
				? null
				: new CWidgetFieldMultiSelectGroup('exclude_groupids', _('Exclude host groups'))
			)
			->addField($this->isTemplateDashboard()
				? null
				: new CWidgetFieldPatternSelectHost('hosts', _('Host patterns'))
			)
			->addField($this->isTemplateDashboard()
				? null
				: (new CWidgetFieldRadioButtonList('status', _('Host status'), [
					self::HOST_STATUS_ANY => _('Any'),
					self::HOST_STATUS_ENABLED => _('Enabled'),
					self::HOST_STATUS_DISABLED => _('Disabled')
				]))->setDefault(self::HOST_STATUS_ANY)
			)
			->addField($this->isTemplateDashboard()
				? null
				: (new CWidgetFieldRadioButtonList('host_tags_evaltype', _('Host tags'), [
					TAG_EVAL_TYPE_AND_OR => _('And/Or'),
					TAG_EVAL_TYPE_OR => _('Or')
				]))->setDefault(TAG_EVAL_TYPE_AND_OR)
			)
			->addField($this->isTemplateDashboard()
				? null
				: new CWidgetFieldTags('host_tags')
			)
			->addField(
				new CWidgetFieldSeverities('severities', _('Severity'))
			)
			->addField(
				new CWidgetFieldCheckBox('maintenance',
					$this->isTemplateDashboard() ? _('Show data in maintenance') : _('Show hosts in maintenance')
				)
			)
			->addField(
				new CWidgetFieldCheckBox('no_select_first_entry', _('Do not auto-select first entry'))
			)
			->addField(
				new CWidgetFieldCheckBox('update_on_filter_only', _('Update on filter only'))
			)
			->addField($this->isTemplateDashboard()
				? null
				: new CWidgetFieldCheckBox('add_reset', _('Add a Reset'))
			)
			->addField(
				new CWidgetFieldCheckBox('host_groups_only', _('Show host groups only'))
			)
			->addField(
				(new CWidgetFieldRadioButtonList('problems', _('Show problems'), [
					self::PROBLEMS_ALL => _('All'),
					self::PROBLEMS_UNSUPPRESSED => _('Unsuppressed'),
					self::PROBLEMS_NONE => _('None')
				]))->setDefault(self::PROBLEMS_UNSUPPRESSED)
			)
			->addField(
				new CWidgetFieldHostGrouping('group_by', _('Group by'))
			)
			->addField($this->isTemplateDashboard()
				? null
				: (new CWidgetFieldIntegerBox('show_lines', _('Host limit'), self::LINES_MIN, self::LINES_MAX))
					->setDefault(self::LINES_DEFAULT)
					->setFlags(CWidgetField::FLAG_NOT_EMPTY | CWidgetField::FLAG_LABEL_ASTERISK)
			)
			->addField(
				new CWidgetFieldMultiSelectOverrideHost()
			);
	}

	public function validate(bool $strict = false): array {
		$errors = parent::validate($strict);
		if ($errors) {
			return $errors;
		}

		if ($this->getFieldValue('host_groups_only')) {
			$grouped_by_group = false;
			foreach ($this->getFieldValue('group_by') as $gf) {
				if ($gf['attribute'] === CWidgetFieldHostGrouping::GROUP_BY_HOST_GROUP) {
					$grouped_by_group = true;
					break;
				}
			}

			if (!$grouped_by_group) {
				$errors[] = _s('Using \'Show host groups only\' requires a \'Group by\' of \'Host group\'');
			}
		}

		return $errors;
	}
}
