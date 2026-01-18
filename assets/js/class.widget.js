

class CWidgetHostAndGroupNavigator extends CWidget {

	/**
	 * Host navigator instance.
	 *
	 * @type {CHostNavigator|null}
	 */
	#host_navigator = null;

	/**
	 * Listeners of host navigator widget.
	 *
	 * @type {Object}
	 */
	#listeners = {};

	/**
	 * Scroll amount of contents.
	 *
	 * @type {number}
	 */
	#contents_scroll_top = 0;

	/**
	 * ID of selected host.
	 *
	 * @type {string|null}
	 */
	#selected_hostid = null;

	/**
	 * ID of selected group.
	 *
	 * @type {string|null}
	 */
	#selected_groupid = null;

	/**
	 * CSRF token for navigation.tree.toggle action.
	 *
	 * @type {string|null}
	 */
	#csrf_token = null;

	#refInHosts = false;
	#group_cookie_set = false;
	#original_hostid = null;

	#isSelectingText = false;
	#scrollTop = 0;
	#currentScrollTop = 0;

	#searchBoxValue = '';
	#inputHadFocus = false;

	constructor(...args) {
		super(...args);
	}

	onActivate() {
		this._contents.scrollTop = this.#contents_scroll_top;
	}

	onDeactivate() {
		this.#contents_scroll_top = this._contents.scrollTop;
	}

	onDestroy() {
		this.#updateProfiles(false, [], this._widgetid);
	}

	getUpdateRequestData() {
		return {
			...super.getUpdateRequestData(),
			with_config: this.#host_navigator === null ? 1 : undefined
		};
	}

	setContents(response) {
		if (this._fields.update_on_filter_only) {
			const groupIdsObj = this.getFieldsReferredData().get('groupids');
			if (groupIdsObj && (groupIdsObj.value.length === 0 || groupIdsObj.value.includes('000000'))) {
				this.clearContents();
				this.setCoverMessage({
					message: t('Choose a host group value to update'),
					icon: ZBX_ICON_SEARCH_LARGE
				});

				return;
			}
		}

		if (response.hosts.length === 0) {
			this.clearContents();
			this.setCoverMessage({
				message: t('No data found'),
				icon: ZBX_ICON_SEARCH_LARGE
			});

			return;
		}

		this.#csrf_token = response[CSRF_TOKEN_NAME];

		if (this.#host_navigator === null) {
			this.clearContents();

			this.#host_navigator = new CHostAndGroupNavigator(response.config);
			this._body.appendChild(this.#host_navigator.getContainer());

			this.#registerListeners();
			this.#activateListeners();
		}

		if (this._fields.add_reset) {
			response.hosts.push({
				'hostid': '000000',
				'name': 'RESET DISPLAY',
				'level': 0,
				'problem_count': [0, 0, 0, 0, 0, 0],
			});
		}

		this.setupScrollListener();

		this.#host_navigator.setValue({
			hosts: response.hosts,
			maintenances: response.maintenances,
			is_limit_exceeded: response.is_limit_exceeded,
			selected_hostid: this.#selected_hostid
		});

		if (this._fields.group_by?.[0]?.attribute === 0) {
			this.hideGroupNodes();
			this.processNodes(response);
			this.refreshTree();
		}

		let references = this.getReferenceFromCookie("references");
		this.#refInHosts = false;

		if (references) {
			try {
				var reference_cookie = JSON.parse(references);
				for (let i = 0; i < response.hosts.length; i++) {
					if (response.hosts[i]['hostid'] == reference_cookie['hostids']) {
						this.#refInHosts = true;
						break;
					}
				}

				this.#selected_groupid = reference_cookie['hostgroupids'][0];
				if (this.all_group_ids?.includes(this.#selected_groupid)) {
					this.#group_cookie_set = true;
				}

				if (this.#refInHosts) {
					if (reference_cookie['hostids']) {
						this.#selected_hostid = reference_cookie['hostids'][0];
						this.setNewCookie(reference_cookie, 'hostids', this.#selected_hostid);
					}
				}

				if (this.#group_cookie_set) {
					if (reference_cookie['hostgroupids']) {
						this.#selected_groupid = reference_cookie['hostgroupids'][0];
						this.setNewCookie(reference_cookie, 'hostgroupids', this.#selected_groupid);
					}
				}

			}
			catch (error) {
				console.warn('Invalid JSON for cookie: "references"', error);
			}
		}

		if (this._fields.group_by?.[0]?.attribute === 0) {
			this.initAutocomplete();

			// Restore focus if it was previously focused
			if (this.#inputHadFocus && this.autocompleteInput) {
				requestAnimationFrame(() => {
					this.autocompleteInput.focus();
					const length = this.autocompleteInput.value.length;
					this.autocompleteInput.setSelectionRange(length, length);
				});
			}
		}

		if (!this.hasEverUpdated()) {
			this.#original_hostid = this.#selected_hostid;
		}

		if (!this._fields.no_select_first_entry) {
			if ((!this.hasEverUpdated() || (this.hasEverUpdated() && this.#original_hostid === null)) && this.isReferred()) {
				if (!this.#refInHosts) {
					this.#selected_hostid = this.#getDefaultSelectable();
				}
			}

			if (this.#selected_groupid !== null) {
				if (this._fields.group_by?.[0]?.attribute === 0) {
					this.hideGroupNodes();
					this.selectAndHighlightNodes();
				}
			}

			if (!this._fields.host_groups_only && this.#selected_hostid !== null) {
				this.#host_navigator.selectItem(this.#selected_hostid);
			}
		}
		else {
			if (this.hasEverUpdated()) {
				if (this.#selected_groupid !== null) {
					if (this._fields.group_by?.[0]?.attribute === 0) {
						this.hideGroupNodes();
						this.selectAndHighlightNodes();
					}
				}

				if (!this._fields.host_groups_only && (this.#selected_hostid !== this.#original_hostid)) {
					this.#host_navigator.selectItem(this.#selected_hostid);
				}
			}
		}

		this.scrollToSelection();

		const autocompleteInput = this._container.querySelector('.autocomplete-input');
		const widgetContents = this._container.querySelector('.dashboard-grid-widget-contents');

		if (autocompleteInput !== null) {
			autocompleteInput.addEventListener('mousedown', () => {
				this.#isSelectingText = true;
				this.#scrollTop = widgetContents.scrollTop;
			});

			this.detachScrollListeners();
			this.boundMouseUp = this.handleMouseUpHnav.bind(this);
			this.attachScrollListeners();

			widgetContents.addEventListener('scroll', (event) => {
				if (this.#isSelectingText) {
					widgetContents.scrollTop = this.#scrollTop;
				}
			});
		}

	}

	attachScrollListeners() {
		document.addEventListener('mouseup', this.boundMouseUp);
	}

	detachScrollListeners() {
		document.removeEventListener('mouseup', this.boundMouseUp);
	}

	handleMouseUpHnav() {
		if (this.#isSelectingText) {
			this.#isSelectingText = false;
			document.body.style.userSelect = '';
		}
	}

	findGroupId(data, searchString) {
		for (let item of data) {
			for (let group of item.hostgroups ?? []) {
				if (group.name === searchString) {
					return group.groupid;
				}
			}

			for (let group of item.extra_groups ?? []) {
				if (group.name === searchString) {
					return group.groupid;
				}
			}
		}
		return null;
	}


	getReferenceFromCookie(name) {
		let cookieString = document.cookie;
		let cookies = cookieString.split(';');
		for (let i = 0; i < cookies.length; i++) {
			let cookie = cookies[i].trim();
			if (cookie.startsWith(name + '=')) {
				let value = cookie.substring(name.length + 1);
				return decodeURIComponent(value);
			}
		}
		return null;
	}


	setNewCookie(c, key, id) {
		let new_reference;
		if (c) {
			c[key] = [id];
			new_reference = JSON.stringify(c);
		}
		else {
			new_reference = '{"hostids":["' + this.#selected_hostid + '"],"hostgroupids":["' + this.#selected_groupid + '"]}';
		}
		let currentTime = new Date();
		currentTime.setTime(currentTime.getTime() + (7 * 24 * 60 * 60 * 1000));
		document.cookie = "references=" + new_reference + "; expires=" + currentTime.toUTCString() + "; path=/";
	}


	#broadcast() {
		if (this.#selected_hostid) {
			this.broadcast({
				[CWidgetsData.DATA_TYPE_HOST_ID]: [this.#selected_hostid],
				[CWidgetsData.DATA_TYPE_HOST_IDS]: [this.#selected_hostid]
			});
			const references = this.getReferenceFromCookie('references');
			const c_reference = JSON.parse(references);
			this.setNewCookie(c_reference, 'hostids', this.#selected_hostid);
		}
	}

	#broadcastGroup() {
		if (this.#selected_groupid) {
			this.broadcast({
				[CWidgetsData.DATA_TYPE_HOST_GROUP_ID]: [this.#selected_groupid],
				[CWidgetsData.DATA_TYPE_HOST_GROUP_IDS]: [this.#selected_groupid]
			});
			const references = this.getReferenceFromCookie('references');
			const c_reference = JSON.parse(references);
			this.setNewCookie(c_reference, 'hostgroupids', this.#selected_groupid);
		}
	}

	#getDefaultSelectable() {
		const selected_element = this._body.querySelector(`.${CNavigationTree.ZBX_STYLE_NODE_IS_ITEM}`);

		return selected_element !== null ? selected_element.dataset.id : null;
	}

	onReferredUpdate() {
		if (this.#host_navigator === null || this.#selected_hostid !== null) {
			return;
		}

		this.#selected_hostid = this.#getDefaultSelectable();

		if (this.#selected_hostid !== null) {
			this.#host_navigator.selectItem(this.#selected_hostid);
		}
	}

	#registerListeners() {
		this.#listeners = {
			hostSelect: ({detail}) => {
				this.#selected_hostid = detail.hostid;

				this.#broadcast();
			},

			groupToggle: ({detail}) => {
				if (this._widgetid) {
					this.#updateProfiles(detail.is_open, detail.group_identifier, this._widgetid);
				}
			}
		};
	}

	#activateListeners() {
		this.#host_navigator.getContainer().addEventListener(CHostNavigator.EVENT_HOST_SELECT,
			this.#listeners.hostSelect
		);
		this.#host_navigator.getContainer().addEventListener(CHostNavigator.EVENT_GROUP_TOGGLE,
			this.#listeners.groupToggle
		);
	}

	/**
	 * Update expanded and collapsed group state in user profile.
	 *
	 * @param {boolean} is_open          Indicator whether the group is open or closed.
	 * @param {array}   group_identifier Group path identifier.
	 * @param {string}  widgetid         Widget ID.
	 */
	#updateProfiles(is_open, group_identifier, widgetid) {
		const curl = new Curl('zabbix.php');

		curl.setArgument('action', 'widget.navigation.tree.toggle');

		fetch(curl.getUrl(), {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({is_open, group_identifier, widgetid, [CSRF_TOKEN_NAME]: this.#csrf_token})
		})
			.then((response) => response.json())
			.then((response) => {
				if ('error' in response) {
					throw {error: response.error};
				}

				return response;
			})
			.catch((exception) => {
				let title;
				let messages = [];

				if (typeof exception === 'object' && 'error' in exception) {
					title = exception.error.title;
					messages = exception.error.messages;
				}
				else {
					title = t('Unexpected server error.');
				}

				this._updateMessages(messages, title);
			});
	}

	hasPadding() {
		return false;
	}

	onResize() {
		this._closeDropdown();
	}

	hideGroupNodes() {
		if (this._fields.host_groups_only) {
			const inodes = this._container.querySelectorAll('.navigation-tree-node-is-item');
			inodes.forEach(inode => {
				inode.remove();
			});
		}

		const nodes = this._container.querySelectorAll('[data-group_identifier]');
		nodes.forEach(node => {
			node.classList.remove('navigation-tree-node-is-open');
		});
	}

	initAutocomplete() {
		const self = this;
		const $container = $(this._container);
		const $hostNavigator = $container.find('.host-navigator');
		const $widgetContents= $container.find('.dashboard-grid-widget-body');

		const $oldContainer = $container.find('.autocomplete-container');
		if ($oldContainer.length > 0) {
			$oldContainer.remove();
		}

		// Clean up existing dropdown if it exists
		if (this.autocompleteDropdown && this.autocompleteDropdown.parentNode) {
			this.autocompleteDropdown.remove();
		}

		const extractGroupIdentifiers = () => {
			const groupIdentifiers = new Set();
			$('[data-group_identifier]', $hostNavigator).each(function () {
				const groupId = $(this).attr('data-group_id');
				if (groupId) {
					const identifier = JSON.parse($(this).attr('data-group_identifier')).join('/');
					groupIdentifiers.add(identifier);
				}
			});
			return Array.from(groupIdentifiers);
		};

		const groupIdentifiers = extractGroupIdentifiers();

		const $inputBox = $(`<input type="text" placeholder="Search for a host group..." value="${self.#searchBoxValue}" class="autocomplete-input">`);
		$inputBox.attr({
			'autocomplete': 'off',
			'role': 'combobox',
			'aria-autocomplete': 'list',
			'aria-expanded': 'false',
			'aria-controls': 'autocomplete-dropdown-' + self._widgetid
		});

		const $dropdownArrow = $('<div class="zi-chevron-down modified-chevron"></div>');
		$dropdownArrow.attr({
			'role': 'button',
			'tabindex': '0',
			'aria-label': 'Toggle dropdown'
		});

		const $dropdown = $('<div class="autocomplete-dropdown"></div>');
		$dropdown.attr({
			'data-autocomplete-dropdown': 'true',
			'role': 'listbox',
			'id': 'autocomplete-dropdown-' + self._widgetid,
			'tabindex': '-1'
		});

		const $autocompleteContainer = $('<div class="autocomplete-container"></div>').append($inputBox).append($dropdownArrow);
		$autocompleteContainer.attr('data-autocomplete-widget', 'true');
		$widgetContents.before($autocompleteContainer);

		let currentIndex = -1;

		// Position dropdown dynamically with RAF
		const positionDropdown = () => {
			if (!document.body.contains($autocompleteContainer[0])) {
				return;
			}

			const containerOffset = $autocompleteContainer.offset();
			const containerWidth = $autocompleteContainer.outerWidth();

			$dropdown.css({
				'position': 'fixed',
				'top': containerOffset.top + $autocompleteContainer.outerHeight() + 'px',
				'left': containerOffset.left + 'px',
				'width': (containerWidth - 40) + 'px'
			});
		};

		// Helper function to get first visible item
		const getFirstVisibleItem = () => {
			const allItems = $dropdown.find('.autocomplete-item');
			return allItems.length > 0 ? allItems[0] : null;
		};

		// Focus item function
		const focusItem = (index) => {
			const allItems = $dropdown.find('.autocomplete-item');
			if (allItems.length === 0) return;

			allItems.removeClass('focused');

			if (index >= 0 && index < allItems.length) {
				const itemToFocus = $(allItems[index]);
				if (!itemToFocus.hasClass('hidden-by-search')) {
					currentIndex = index;
					itemToFocus.addClass('focused');
					itemToFocus[0].scrollIntoView({ block: 'nearest' });
				}
			}
		};

		// Close dropdown function (defined early so it can be used by observers)
		const closeDropdown = () => {
			$dropdown.hide();
			$inputBox.attr('aria-expanded', 'false');
			$dropdownArrow.removeClass('open');
			currentIndex = -1;
			$dropdown.find('.autocomplete-item').removeClass('focused');
			cleanupRepositionHandlers();
			cleanupOutsideClickHandler();

			setTimeout(() => {
				self._resumeUpdating();
			}, 10);
		};

		this._closeDropdown = closeDropdown;

		// RAF-based repositioning
		const rafPlace = () => {
			if (this._autocompleteRafId) {
				cancelAnimationFrame(this._autocompleteRafId);
			}
			this._autocompleteRafId = requestAnimationFrame(() => {
				// Check if widget is being dragged
				if (self._isDragging()) {
					closeDropdown();
					return;
				}
				positionDropdown();
				this._autocompleteRafId = null;
			});
		};

		// Setup reposition handlers
		const setupRepositionHandlers = () => {
			if (this._autocompleteRepositionHandler) {
				window.removeEventListener('scroll', this._autocompleteRepositionHandler, true);
				window.removeEventListener('resize', this._autocompleteRepositionHandler, true);
				this._autocompleteRepositionHandler = null;
			}

			this._autocompleteRepositionHandler = () => {
				rafPlace();
			};

			window.addEventListener('scroll', this._autocompleteRepositionHandler, true);
			window.addEventListener('resize', this._autocompleteRepositionHandler, true);
		};

		// Cleanup reposition handlers
		const cleanupRepositionHandlers = () => {
			if (this._autocompleteRepositionHandler) {
				window.removeEventListener('scroll', this._autocompleteRepositionHandler, true);
				window.removeEventListener('resize', this._autocompleteRepositionHandler, true);
				this._autocompleteRepositionHandler = null;
			}

			if (this._autocompleteRafId) {
				cancelAnimationFrame(this._autocompleteRafId);
				this._autocompleteRafId = null;
			}
		};

		// Setup outside click handler
		const setupOutsideClickHandler = () => {
			if (this._autocompleteOutsideClickHandler) {
				document.removeEventListener('click', this._autocompleteOutsideClickHandler);
				this._autocompleteOutsideClickHandler = null;
			}

			this._autocompleteOutsideClickHandler = (e) => {
				let element = e.target;
				let isOurDropdown = false;

				while (element && element !== document) {
					if (element.hasAttribute && (element.hasAttribute('data-autocomplete-widget') ||
							element.hasAttribute('data-autocomplete-dropdown'))) {
						isOurDropdown = true;
						break;
					}
					element = element.parentElement;
				}

				if (!isOurDropdown) {
					closeDropdown();
				}
			};

			setTimeout(() => {
				document.addEventListener('click', this._autocompleteOutsideClickHandler);
			}, 10);
		};

		// Cleanup outside click handler
		const cleanupOutsideClickHandler = () => {
			if (this._autocompleteOutsideClickHandler) {
				document.removeEventListener('click', this._autocompleteOutsideClickHandler);
				this._autocompleteOutsideClickHandler = null;
			}
		};

		// Watch for dragging via MutationObserver
		const dragObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					if (self._isDragging() && $dropdown.is(':visible')) {
						closeDropdown();
					}
				}
			});
		});

		dragObserver.observe(self._target, {
			attributes: true,
			attributeFilter: ['class']
		});

		this._autocompleteDragObserver = dragObserver;

		const openDropdown = (skipFocus = false) => {
			self._pauseUpdating();

			if (!document.body.contains($dropdown[0])) {
				document.body.appendChild($dropdown[0]);
			}

			setupRepositionHandlers();

			requestAnimationFrame(() => {
				positionDropdown();
				$dropdown.show();
				$inputBox.attr('aria-expanded', 'true');
				$dropdownArrow.addClass('open');
				setupOutsideClickHandler();

				if (!skipFocus) {
					const firstVisible = getFirstVisibleItem();
					if (firstVisible) {
						const idx = $(firstVisible).data('index');
						focusItem(idx);
					}
					$dropdown.focus();
				}
			});
		};

		function processSelectedNode(groupNode, fromAutocomplete = false) {
			if (groupNode.length > 0) {
				self.#selected_groupid = groupNode.attr('data-group_id');
				if (self.#selected_groupid === undefined) {
					self.#selected_groupid = '000000';
				}
				self.hideGroupNodes();
				const $infoDiv = groupNode.find('.navigation-tree-node-info').first()[0];

				if (self.#selected_groupid !== '000000') {
					self.markSelected($infoDiv);
				}

				self.refreshTree();
				self.scrollToSelection();

				if (fromAutocomplete && self.autocompleteInput) {
					requestAnimationFrame(() => {
						self.autocompleteInput.focus();
						const length = self.autocompleteInput.value.length;
						self.autocompleteInput.setSelectionRange(length, length);
					});
				}
			}
		}

		// Populate dropdown with items
		const populateDropdown = (filterTerm = '') => {
			$dropdown.empty();
			const searchRegex = filterTerm ? new RegExp(filterTerm.replace(/\*/g, '.*')) : null;

			let displayIndex = 0; // Track the actual display index
			groupIdentifiers.forEach((group, originalIndex) => {
				if (!searchRegex || searchRegex.test(group.toLowerCase())) {
					const $item = $('<div class="autocomplete-item"></div>').text(group);
					$item.attr({
						'role': 'option',
						'data-index': displayIndex, // Use displayIndex instead of originalIndex
						'data-text': group.toLowerCase()
					});

					$item.on('click', function(e) {
						e.stopPropagation();
						self.#searchBoxValue = group;
						$inputBox.val(group);
						closeDropdown();
						const $groupNode = $hostNavigator.find(`[data-group_identifier='["${group.split('/').join('","')}"]']`);
						processSelectedNode($groupNode, true);
					});

					$item.on('mouseenter', function() {
						focusItem(displayIndex);
					});

					$dropdown.append($item);
					displayIndex++;
				}
			});
		};

		// Search input focus tracking
		$inputBox.on('focus', function() {
			self.#inputHadFocus = true;
		});

		$inputBox.on('blur', function() {
			self.#inputHadFocus = false;
		});

		// Search input handlers
		$inputBox.on('input', function() {
			const val = $(this).val();
			self.#searchBoxValue = val;
			const valLower = val.toLowerCase();

			if (val === '') {
				closeDropdown();
				return;
			}

			populateDropdown(valLower);

			if ($dropdown.children().length > 0) {
				if (valLower.length > 0) {
					openDropdown(true);
				}
				else {
					openDropdown();
				}
			}
			else {
				closeDropdown();
			}
		});

		// Search input keyboard navigation
		$inputBox.on('keydown', function(e) {
			const allItems = $dropdown.find('.autocomplete-item');

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					if ($dropdown.is(':visible')) {
						if (currentIndex < 0 && allItems.length > 0) {
							focusItem(0);
						}
						$dropdown.focus();
					}
					else {
						openDropdown();
					}
					break;
				case 'ArrowUp':
					e.preventDefault();
					if ($dropdown.is(':visible')) {
						if (allItems.length > 0) {
							focusItem(allItems.length - 1);
						}
						$dropdown.focus();
					}
					else {
						openDropdown();
					}
					break;
				case 'Escape':
					e.preventDefault();
					closeDropdown();
					$inputBox.val('');
					self.#searchBoxValue = '';
					populateDropdown();
					break;
				case 'Enter':
					e.preventDefault();
					const firstVisible = getFirstVisibleItem();
					if (firstVisible) {
						$(firstVisible).click();
					}
					break;
			}
		});

		// Dropdown arrow click handler
		$dropdownArrow.on('click', function(e) {
			e.stopPropagation();
			e.preventDefault();

			if ($dropdown.is(':visible')) {
				closeDropdown();
			}
			else {
				populateDropdown();
				openDropdown();
			}
		});

		// Dropdown arrow keyboard handler
		$dropdownArrow.on('keydown', function(e) {
			switch (e.key) {
				case ' ':
				case 'Enter':
					e.preventDefault();
					if ($dropdown.is(':visible')) {
						closeDropdown();
					}
					else {
						populateDropdown();
						openDropdown();
					}
					break;
				case 'ArrowDown':
					e.preventDefault();
					populateDropdown();
					openDropdown();
					break;
				case 'ArrowUp':
					e.preventDefault();
					populateDropdown();
					openDropdown();
					const allItems = $dropdown.find('.autocomplete-item');
					if (allItems.length > 0) {
						focusItem(allItems.length - 1);
					}
					break;
				case 'Escape':
					e.preventDefault();
					closeDropdown();
					break;
			}
		});

		// Dropdown list keyboard navigation
		$dropdown.on('keydown', function(e) {
			const allItems = $dropdown.find('.autocomplete-item');

			if (allItems.length === 0) return;

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					let nextIndex = currentIndex + 1;
					if (nextIndex >= allItems.length) {
						nextIndex = 0;
					}
					focusItem(nextIndex);
					break;
				case 'ArrowUp':
					e.preventDefault();
					let prevIndex = currentIndex - 1;
					if (prevIndex < 0) {
						prevIndex = allItems.length - 1;
					}
					focusItem(prevIndex);
					break;
				case 'Enter':
					e.preventDefault();
					if (currentIndex >= 0 && currentIndex < allItems.length) {
						$(allItems[currentIndex]).click();
					}
					break;
				case 'Escape':
					e.preventDefault();
					closeDropdown();
					$inputBox.focus();
					break;
				case 'Tab':
					closeDropdown();
					break;
			}
		});

		// Store references for cleanup
		this.autocompleteDropdown = $dropdown[0];
		this.autocompleteInput = $inputBox[0];
		this.autocompleteContainer = $autocompleteContainer[0];
	}

	setupScrollListener() {
		const hostNavigator = this._body.querySelector('.host-navigator');
		if (hostNavigator) {
			hostNavigator.addEventListener('scroll', () => {
				this.#currentScrollTop = hostNavigator.scrollTop;
			});
		}
	}

	scrollToSelection() {
		const hostNavigator = this._body.querySelector('.host-navigator');
		if (!hostNavigator) return;

		const selectedItem = hostNavigator.querySelector('.nav-selected');
		const parentElement = selectedItem?.closest('.navigation-tree-node-is-group');
		const container = this._container.querySelector('.dashboard-grid-widget-contents');
		const offset = 80;
		if (selectedItem && parentElement) {
			const containerRect = container.getBoundingClientRect();
			const elementRect = parentElement.getBoundingClientRect();

			const scrollToAdjustment = elementRect.top - containerRect.top - offset;
			container.scrollTop += scrollToAdjustment;
		}
		else {
			hostNavigator.scrollTop = this.#currentScrollTop;
		}
	}

	processNodes(response) {
		const nodes = this._container.querySelectorAll('[data-group_identifier]');
		const group_array = Array.from(nodes);
		this.all_group_ids = [];

		group_array.forEach(node => {
			const group_identity = JSON.parse(node.getAttribute('data-group_identifier'));
			const group_identity_s = group_identity.join('/');
			const groupID = this.findGroupId(response.hosts, group_identity_s);
			if (!groupID) {
				return;
			}

			node.setAttribute('data-group_id', groupID);
			this.all_group_ids.push(groupID);

			const infoDiv = node.querySelector('.navigation-tree-node-info');
			if (infoDiv) {
				infoDiv.classList.add('nav-hoverable');
				infoDiv.addEventListener('click', (event) => {
					const isPrimaryClick = event.target.closest('.navigation-tree-node-info-primary span');
					const isHelperClick = event.target.closest('button');

					if (isPrimaryClick && !isHelperClick) {
						event.stopPropagation();
						this.hideGroupNodes();
						this.#selected_groupid = groupID;
						this.markSelected(infoDiv);
						this.refreshTree();
						this.scrollToSelection();
					}
				});
			}
		});
	}

	markSelected(node) {
		if (node.classList.contains('nav-selected')) {
			node.classList.remove('nav-selected');
			this.#selected_groupid = '000000';
		}
		else {
			this._container.querySelectorAll('.nav-selected').forEach(el => el.classList.remove('nav-selected'));
			node.classList.add('nav-selected');
		}
		this.#broadcastGroup();
	}

	selectAndHighlightNodes() {
		const nodes = this._container.querySelectorAll('[data-group_id]');
		if (this.#selected_groupid !== null) {
			if (this.#selected_groupid === '000000') {
				this.#broadcastGroup();
			}
			else {
				let groupExists = false;
				for (const node of nodes) {
					if (node.getAttribute('data-group_id') === this.#selected_groupid) {
						const reloadInfoDiv = node.querySelector('.navigation-tree-node-info');
						reloadInfoDiv.classList.add('nav-selected');
						this.#broadcastGroup();
						groupExists = true;
						break;
					}
				}

				if (!groupExists) {
					this.broadcast({
						[CWidgetsData.DATA_TYPE_HOST_GROUP_ID]: ['000000'],
						[CWidgetsData.DATA_TYPE_HOST_GROUP_IDS]: ['000000']
					});
				}
			}

			this.refreshTree();
		}
	}

	refreshTree() {
		this._container.querySelectorAll('.navigation-tree-node').forEach(node => {
			const infoDiv = node.querySelector('.navigation-tree-node-info');
			const arrowSpan = infoDiv?.querySelector('.navigation-tree-node-info-arrow span');

			if (arrowSpan) {
				if (node.classList.contains('navigation-tree-node-is-open')) {
					arrowSpan.classList.add('arrow-down');
					arrowSpan.classList.remove('arrow-right');
				}
				else {
					arrowSpan.classList.add('arrow-right');
					arrowSpan.classList.remove('arrow-down');
				}
			}

			if (node.classList.contains('nav-selected') || node.querySelector('.nav-selected')) {
				let current = node;

				while (true) {
					const childrenContainer = current.parentElement;
					if (!childrenContainer || !childrenContainer.classList.contains('navigation-tree-node-children')) break;

					const parentNode = childrenContainer.parentElement;
					if (!parentNode || !parentNode.classList.contains('navigation-tree-node')) break;

					if (!parentNode.classList.contains('navigation-tree-node-is-open')) {
						parentNode.classList.add('navigation-tree-node-is-open');
						const parentInfoDiv = parentNode.querySelector('.navigation-tree-node-info');
						const parentArrowSpan = parentInfoDiv?.querySelector('.navigation-tree-node-info-arrow span');
						if (parentArrowSpan) {
							parentArrowSpan.classList.add('arrow-down');
							parentArrowSpan.classList.remove('arrow-right');
						}
					}

					current = parentNode;
				}
			}
		});

		const selectedNode = this._container.querySelector('.nav-selected');
		if (selectedNode) {
			const selectedGroupNode = selectedNode.closest('.navigation-tree-node.navigation-tree-node-is-group');
			if (selectedGroupNode && !selectedGroupNode.classList.contains('navigation-tree-node-is-open')) {
				selectedGroupNode.classList.add('navigation-tree-node-is-open');
				const infoDiv = selectedGroupNode.querySelector('.navigation-tree-node-info');
				const arrowSpan = infoDiv?.querySelector('.navigation-tree-node-info-arrow span');
				if (arrowSpan) {
					arrowSpan.classList.add('arrow-down');
					arrowSpan.classList.remove('arrow-right');
				}
			}
		}
	}

	onClearContents() {
		if (this.#host_navigator !== null) {
			this.#host_navigator.destroy();
			this.#host_navigator = null;
		}

		if (this._autocompleteRepositionHandler) {
			window.removeEventListener('scroll', this._autocompleteRepositionHandler, true);
			window.removeEventListener('resize', this._autocompleteRepositionHandler, true);
			this._autocompleteRepositionHandler = null;
		}

		if (this._autocompleteOutsideClickHandler) {
			document.removeEventListener('click', this._autocompleteOutsideClickHandler);
			this._autocompleteOutsideClickHandler = null;
		}

		if (this._autocompleteRafId) {
			cancelAnimationFrame(this._autocompleteRafId);
			this._autocompleteRafId = null;
		}

		if (this._autocompleteDragObserver) {
			this._autocompleteDragObserver.disconnect();
			this._autocompleteDragObserver = null;
		}

		if (this.autocompleteDropdown && this.autocompleteDropdown.parentNode) {
			this.autocompleteDropdown.remove();
			this.autocompleteDropdown = null;
		}
	}

}
