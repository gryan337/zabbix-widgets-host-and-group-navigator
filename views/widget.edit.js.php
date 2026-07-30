<?php declare(strict_types = 0);

use Modules\HostAndGroupNavigator\Includes\WidgetForm;

?>

window.widget_hostandgroupnavigator_form = new class {

	/**
	 * Widget form.
	 *
	 * @type {HTMLFormElement}
	 */
	#form;
	
	/**
	 * @type {string}
	 */
	#templateid;

	/**
	 * Sentinel value indicating show_lines_groups has never been configured.
	 *
	 * @type {number}
	 */
	#group_lines_default = 0;

	/**
	 * Saved group_by rows before host_groups_only was enabled.
	 *
	 * @type {HTMLElement[]|null}
	 */
	#saved_group_by_rows = null;


	init({templateid}) {
		this.#form = document.getElementById('widget-dialogue-form');
		this.#updateForm();

		this.#form.querySelector('#host_groups_only').addEventListener('change', () => {
			const checkbox = this.#form.querySelector('#host_groups_only');
			const show_lines_groups = this.#form.querySelector('#show_lines_groups');
			const tbody = this.#form.querySelector('#group_by-table tbody');

			if (checkbox.checked) {
				if (show_lines_groups.value == this.#group_lines_default) {
					show_lines_groups.value = this.#form.querySelector('#show_lines').value;
				}

				// Snapshot row data before clearing.
				this.#saved_group_by_rows = [...tbody.querySelectorAll('.form_row')].map(row => ({
					attribute: row.querySelector('z-select').value,
					tag_name: row.querySelector('input[id$="_tag_name"]')?.value ?? ''
				}));

				for (const row of [...tbody.querySelectorAll('.form_row')]) {
					row.remove();
				}

				this.#form.querySelector('#add-row').click();

				const new_select = tbody.querySelector('.form_row z-select');

				if (new_select !== null) {
					new_select.value = 0;
					new_select.dispatchEvent(new Event('change', {bubbles: true}));
				}
			}
			else {
				for (const row of [...tbody.querySelectorAll('.form_row')]) {
					row.remove();
				}

				if (this.#saved_group_by_rows !== null && this.#saved_group_by_rows.length > 0) {
					for (const saved of this.#saved_group_by_rows) {
						this.#form.querySelector('#add-row').click();

						const new_row = [...tbody.querySelectorAll('.form_row')].at(-1);
						const new_select = new_row.querySelector('z-select');

						if (new_select !== null) {
							new_select.value = saved.attribute;
							new_select.dispatchEvent(new Event('change', {bubbles: true}));
						}

						const tag_input = new_row.querySelector('input[id$="_tag_name"]');

						if (tag_input !== null && saved.tag_name !== '') {
							tag_input.value = saved.tag_name;
						}
					}
				}

				this.#saved_group_by_rows = null;
			}
		});

		this.#form.addEventListener('change', () => this.#updateForm());
	}

	/**
	 *  Update widget form field visibility
	 */
	#updateForm() {
		const show_host_groups_only = this.#form.querySelector('#host_groups_only').checked;

		const group_by_field = this.#form.querySelector('#group_by-table').closest('.form-field');
		const group_by_label = group_by_field.previousElementSibling;

		group_by_field.style.display = show_host_groups_only ? 'none' : '';
		group_by_label.style.display = show_host_groups_only ? 'none' : '';

		for (const host_limit_field of this.#form.querySelectorAll('.field-host-limit')) {
			host_limit_field.style.display = show_host_groups_only ? 'none' : '';
			for (const input of host_limit_field.querySelectorAll('input')) {
				input.disabled = show_host_groups_only;
			}
		}

		for (const host_group_limit_field of this.#form.querySelectorAll('.field-host-group-limit')) {
			host_group_limit_field.style.display = show_host_groups_only ? '' : 'none';
			for (const input of host_group_limit_field.querySelectorAll('input')) {
				input.disabled = !show_host_groups_only;
			}
		}
	}
}
