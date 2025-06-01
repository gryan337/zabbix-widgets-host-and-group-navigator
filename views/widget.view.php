<?php declare(strict_types = 0);


/**
 * Host navigator widget view.
 *
 * @var CView $this
 * @var array $data
 */

$view = (new CWidgetView($data))->setVar(CSRF_TOKEN_NAME, CCsrfTokenHelper::get('widget'));

foreach ($data['vars'] as $name => $value) {
	if ($value !== null) {
		$view->setVar($name, $value);
	}
}

$view->show();
