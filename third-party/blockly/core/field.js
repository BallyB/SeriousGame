/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2012 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Field.  Used for editable titles, variables, etc.
 * This is an abstract class that defines the UI on the block.  Actual
 * instances would be Blockly.FieldTextInput, Blockly.FieldDropdown, etc.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.Field');

goog.require('Blockly.Events.BlockChange');
goog.require('Blockly.Gesture');
goog.require('Blockly.utils');

goog.require('goog.math.Size');
goog.require('goog.style');
goog.require('goog.userAgent');


/**
 * Abstract class for an editable field.
 * @param {string} text The initial content of the field.
 * @param {function(string):(string|null|undefined)=} opt_validator An optional
 *     function that is called to validate user input. See setValidator().
 * @constructor
 */
Blockly.Field = function(text, opt_validator) {
  this.size_ = new goog.math.Size(0, Blockly.BlockSvg.MIN_BLOCK_Y);
  this.setValue(text);
  this.setValidator(opt_validator);
};

/**
 * The set of all registered fields, keyed by field type as used in the JSON
 * definition of a block.
 * @type {!Object<string, !{fromJson: Function}>}
 * @private
 */
Blockly.Field.TYPE_MAP_ = {};

/**
 * Registers a field type. May also override an existing field type.
 * Blockly.Field.fromJson uses this registry to find the appropriate field.
 * @param {string} type The field type name as used in the JSON definition.
 * @param {!{fromJson: Function}} fieldClass The field class containing a
 *     fromJson function that can construct an instance of the field.
 * @throws {Error} if the type name is empty, or the fieldClass is not an
 *     object containing a fromJson function.
 */
Blockly.Field.register = function(type, fieldClass) {
  if ((typeof type != 'string') || (type.trim() == '')) {
    throw Error('Invalid field type "' + type + '"');
  }
  if (!fieldClass || (typeof fieldClass.fromJson != 'function')) {
    throw Error('Field "' + fieldClass + '" must have a fromJson function');
  }
  Blockly.Field.TYPE_MAP_[type] = fieldClass;
};

/**
 * Construct a Field from a JSON arg object.
 * Finds the appropriate registered field by the type name as registered using
 * Blockly.Field.register.
 * @param {!Object} options A JSON object with a type and options specific
 *     to the field type.
 * @return {Blockly.Field} The new field instance or null if a field wasn't
 *     found with the given type name
 * @package
 */
Blockly.Field.fromJson = function(options) {
  var fieldClass = Blockly.Field.TYPE_MAP_[options['type']];
  if (fieldClass) {
    return fieldClass.fromJson(options);
  }
  return null;
};

/**
 * Temporary cache of text widths.
 * @type {Object}
 * @private
 */
Blockly.Field.cacheWidths_ = null;

/**
 * Number of current references to cache.
 * @type {number}
 * @private
 */
Blockly.Field.cacheReference_ = 0;


/**
 * Name of field.  Unique within each block.
 * Static labels are usually unnamed.
 * @type {string|undefined}
 */
Blockly.Field.prototype.name = undefined;

/**
 * Maximum characters of text to display before adding an ellipsis.
 * @type {number}
 */
Blockly.Field.prototype.maxDisplayLength = 50;

/**
 * Visible text to display.
 * @type {string}
 * @protected
 */
Blockly.Field.prototype.text_ = '';

/**
 * Block this field is attached to.  Starts as null, then set in init.
 * @type {Blockly.Block}
 * @protected
 */
Blockly.Field.prototype.sourceBlock_ = null;

/**
 * Does this block need to be re-rendered?
 * @type {boolean}
 * @private
 */
Blockly.Field.prototype.isDirty_ = true;

/**
 * Is the field visible, or hidden due to the block being collapsed?
 * @type {boolean}
 * @protected
 */
Blockly.Field.prototype.visible_ = true;

/**
 * Validation function called when user edits an editable field.
 * @type {Function}
 * @protected
 */
Blockly.Field.prototype.validator_ = null;

/**
 * The element the click handler is bound to.
 * @type {!Element}
 * @private
 */
Blockly.Field.prototype.clickTarget_ = null;

/**
 * Non-breaking space.
 * @const
 */
Blockly.Field.NBSP = '\u00A0';

/**
 * Editable fields usually show some sort of UI indicating they are editable.
 * They will also be saved by the XML renderer.
 * @type {boolean}
 * @const
 * @default
 */
Blockly.Field.prototype.EDITABLE = true;

/**
 * Serializable fields are saved by the XML renderer, non-serializable fields
 * are not. Editable fields should also be serializable. This is not the
 * case by default so that SERIALIZABLE is backwards compatible.
 * @type {boolean}
 * @const
 * @default
 */
Blockly.Field.prototype.SERIALIZABLE = false;

/**
 * Attach this field to a block.
 * @param {!Blockly.Block} block The block containing this field.
 */
Blockly.Field.prototype.setSourceBlock = function(block) {
  if (this.sourceBlock_) {
    throw Error('Field already bound to a block.');
  }
  this.sourceBlock_ = block;
};

/**
 * Install this field on a block.
 */
Blockly.Field.prototype.init = function() {
  if (this.fieldGroup_) {
    // Field has already been initialized once.
    return;
  }
  // Build the DOM.
  this.fieldGroup_ = Blockly.utils.createSvgElement('g', {}, null);
  if (!this.visible_) {
    this.fieldGroup_.style.display = 'none';
  }
  this.borderRect_ = Blockly.utils.createSvgElement('rect',
      {
        'rx': 4,
        'ry': 4,
        'x': -Blockly.BlockSvg.SEP_SPACE_X / 2,
        'y': 0,
        'height': 16
      }, this.fieldGroup_);
  /** @type {!Element} */
  this.textElement_ = Blockly.utils.createSvgElement('text',
      {'class': 'blocklyText', 'y': this.size_.height - 12.5},
      this.fieldGroup_);

  this.updateEditable();

  this.clickTarget_ = this.getSvgRoot();
  this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);
  this.mouseDownWrapper_ =
      Blockly.bindEventWithChecks_(
          this.clickTarget_, 'mousedown', this, this.onMouseDown_);
};

/**
 * Initializes the model of the field after it has been installed on a block.
 * No-op by default.
 */
Blockly.Field.prototype.initModel = function() {
};

/**
 * Sets the field's value based on the given XML element. Should only be
 * called by Blockly.Xml.
 * @param {!Element} fieldElement The element containing info about the
 *    field's state.
 * @package
 */
Blockly.Field.prototype.fromXml = function(fieldElement) {
  this.setValue(fieldElement.textContent);
};

/**
 * Serializes this field's value to XML. Should only be called by Blockly.Xml.
 * @param {!Element} fieldElement The element to populate with info about the
 *    field's state.
 * @return {!Element} The element containing info about the field's state.
 * @package
 */
Blockly.Field.prototype.toXml = function(fieldElement) {
  fieldElement.setAttribute('name', this.name);
  fieldElement.textContent = this.getValue();
  return fieldElement;
};

/**
 * Dispose of all DOM objects belonging to this editable field.
 */
Blockly.Field.prototype.dispose = function() {
  if (this.mouseDownWrapper_) {
    Blockly.unbindEvent_(this.mouseDownWrapper_);
    this.mouseDownWrapper_ = null;
  }
  this.sourceBlock_ = null;
  if (this.fieldGroup_) {
    Blockly.utils.removeNode(this.fieldGroup_);
    this.fieldGroup_ = null;
  }
  this.textElement_ = null;
  this.borderRect_ = null;
  this.validator_ = null;
};

/**
 * Add or remove the UI indicating if this field is editable or not.
 */
Blockly.Field.prototype.updateEditable = function() {
  var group = this.getClickTarget_();
  if (!this.EDITABLE || !group) {
    return;
  }
  if (this.sourceBlock_.isEditable()) {
    Blockly.utils.addClass(group, 'blocklyEditableText');
    Blockly.utils.removeClass(group, 'blocklyNonEditableText');
    group.style.cursor = this.CURSOR;
  } else {
    Blockly.utils.addClass(group, 'blocklyNonEditableText');
    Blockly.utils.removeClass(group, 'blocklyEditableText');
    group.style.cursor = '';
  }
};

/**
 * Check whether this field is currently editable.  Some fields are never
 * EDITABLE (e.g. text labels). Other fields may be EDITABLE but may exist on
 * non-editable blocks.
 * @return {boolean} Whether this field is editable and on an editable block
 */
Blockly.Field.prototype.isCurrentlyEditable = function() {
  return this.EDITABLE && !!this.sourceBlock_ && this.sourceBlock_.isEditable();
};

/**
 * Check whether this field should be serialized by the XML renderer.
 * Handles the logic for backwards compatibility and incongruous states.
 * @return {boolean} Whether this field should be serialized or not.
 */
Blockly.Field.prototype.isSerializable = function() {
  var isSerializable = false;
  if (this.name) {
    if (this.SERIALIZABLE) {
      isSerializable = true;
    } else if (this.EDITABLE) {
      console.warn('Detected an editable field that was not serializable.' +
        ' Please define SERIALIZABLE property as true on all editable custom' +
        ' fields. Proceeding with serialization.');
      isSerializable = true;
    }
  }
  return isSerializable;
};

/**
 * Gets whether this editable field is visible or not.
 * @return {boolean} True if visible.
 */
Blockly.Field.prototype.isVisible = function() {
  return this.visible_;
};

/**
 * Sets whether this editable field is visible or not. Should only be called
 * by input.setVisible.
 * @param {boolean} visible True if visible.
 * @package
 */
Blockly.Field.prototype.setVisible = function(visible) {
  if (this.visible_ == visible) {
    return;
  }
  this.visible_ = visible;
  var root = this.getSvgRoot();
  if (root) {
    root.style.display = visible ? 'block' : 'none';
    this.size_.width = 0;
  }
};

/**
 * Sets a new validation function for editable fields, or clears a previously
 * set validator.
 *
 * The validator function takes in the text form of the users input, and
 * optionally returns the accepted field text. Alternatively, if the function
 * returns null, the field value change aborts. If the function does not return
 * anything (or returns undefined), the input value is accepted as valid. This
 * is a shorthand for fields using the validator function call as a field-level
 * change event notification.
 *
 * @param {?function(string):(string|null|undefined)} handler The validator
 *     function or null to clear a previous validator.
 */
Blockly.Field.prototype.setValidator = function(handler) {
  this.validator_ = handler;
};

/**
 * Gets the validation function for editable fields, or null if not set.
 * @return {Function} Validation function, or null.
 */
Blockly.Field.prototype.getValidator = function() {
  return this.validator_;
};

/**
 * Validates a change.  Does nothing.  Subclasses may override this.
 * @param {string} text The user's text.
 * @return {string} No change needed.
 */
Blockly.Field.prototype.classValidator = function(text) {
  return text;
};

/**
 * Calls the validation function for this field, as well as all the validation
 * function for the field's class and its parents.
 * @param {string} text Proposed text.
 * @return {?string} Revised text, or null if invalid.
 */
Blockly.Field.prototype.callValidator = function(text) {
  var classResult = this.classValidator(text);
  if (classResult === null) {
    // Class validator rejects value.  Game over.
    return null;
  } else if (classResult !== undefined) {
    text = classResult;
  }
  var userValidator = this.getValidator();
  if (userValidator) {
    var userResult = userValidator.call(this, text);
    if (userResult === null) {
      // User validator rejects value.  Game over.
      return null;
    } else if (userResult !== undefined) {
      text = userResult;
    }
  }
  return text;
};

/**
 * Gets the group element for this editable field.
 * Used for measuring the size and for positioning.
 * @return {!Element} The group element.
 */
Blockly.Field.prototype.getSvgRoot = function() {
  return /** @type {!Element} */ (this.fieldGroup_);
};

/**
 * Updates the field to match the colour/style of the block. Should only be
 * called by BlockSvg.updateColour().
 * @package
 */
Blockly.Field.prototype.updateColour = function() {
  // Non-abstract sub-classes may wish to implement this. See FieldDropdown.
};

/**
 * Draws the border with the correct width.
 * Saves the computed width in a property.
 * @protected
 */
Blockly.Field.prototype.render_ = function() {
  // Replace the text.
  this.textElement_.textContent = this.getDisplayText_();
  this.updateWidth();
  this.isDirty_ = false;
};

/**
 * Updates the width of the field. This calls getCachedWidth which won't cache
 * the approximated width on IE/Edge when `getComputedTextLength` fails. Once
 * it eventually does succeed, the result will be cached.
 */
Blockly.Field.prototype.updateWidth = function() {
  var width = Blockly.Field.getCachedWidth(this.textElement_);
  if (this.borderRect_) {
    this.borderRect_.setAttribute('width',
        width + Blockly.BlockSvg.SEP_SPACE_X);
  }
  this.size_.width = width;
};

/**
 * Gets the width of a text element, caching it in the process.
 * @param {!Element} textElement An SVG 'text' element.
 * @return {number} Width of element.
 */
Blockly.Field.getCachedWidth = function(textElement) {
  var key = textElement.textContent + '\n' + textElement.className.baseVal;
  var width;

  // Return the cached width if it exists.
  if (Blockly.Field.cacheWidths_) {
    width = Blockly.Field.cacheWidths_[key];
    if (width) {
      return width;
    }
  }

  // Attempt to compute fetch the width of the SVG text element.
  try {
    if (goog.userAgent.IE || goog.userAgent.EDGE) {
      width = textElement.getBBox().width;
    } else {
      width = textElement.getComputedTextLength();
    }
  } catch (e) {
    // In other cases where we fail to geth the computed text. Instead, use an
    // approximation and do not cache the result. At some later point in time
    // when the block is inserted into the visible DOM, this method will be
    // called again and, at that point in time, will not throw an exception.
    return textElement.textContent.length * 8;
  }

  // Cache the computed width and return.
  if (Blockly.Field.cacheWidths_) {
    Blockly.Field.cacheWidths_[key] = width;
  }
  return width;
};

/**
 * Start caching field widths.  Every call to this function MUST also call
 * stopCache.  Caches must not survive between execution threads.
 */
Blockly.Field.startCache = function() {
  Blockly.Field.cacheReference_++;
  if (!Blockly.Field.cacheWidths_) {
    Blockly.Field.cacheWidths_ = {};
  }
};

/**
 * Stop caching field widths.  Unless caching was already on when the
 * corresponding call to startCache was made.
 */
Blockly.Field.stopCache = function() {
  Blockly.Field.cacheReference_--;
  if (!Blockly.Field.cacheReference_) {
    Blockly.Field.cacheWidths_ = null;
  }
};

/**
 * Returns the height and width of the field.
 *
 * This should *in general* be the only place render_ gets called from.
 * @return {!goog.math.Size} Height and width.
 */
Blockly.Field.prototype.getSize = function() {
  if (this.isDirty_) {
    this.render_();
  } else if (this.visible_ && this.size_.width == 0) {
    // If the field is not visible the width will be 0 as well, one of the
    // problems with the old system.
    console.warn('Deprecated use of setting size_.width to 0 to rerender a' +
      ' field. Set field.isDirty_ to true instead.');
    this.render_();
  }
  return this.size_;
};

/**
 * Returns the bounding box of the rendered field, accounting for workspace
 * scaling.
 * @return {!Object} An object with top, bottom, left, and right in pixels
 *     relative to the top left corner of the page (window coordinates).
 * @protected
 */
Blockly.Field.prototype.getScaledBBox_ = function() {
  var bBox = this.borderRect_.getBBox();
  var scaledHeight = bBox.height * this.sourceBlock_.workspace.scale;
  var scaledWidth = bBox.width * this.sourceBlock_.workspace.scale;
  var xy = this.getAbsoluteXY_();
  return {
    top: xy.y,
    bottom: xy.y + scaledHeight,
    left: xy.x,
    right: xy.x + scaledWidth
  };
};

/**
 * Get the text from this field as displayed on screen.  May differ from getText
 * due to ellipsis, and other formatting.
 * @return {string} Currently displayed text.
 * @protected
 */
Blockly.Field.prototype.getDisplayText_ = function() {
  var text = this.text_;
  if (!text) {
    // Prevent the field from disappearing if empty.
    return Blockly.Field.NBSP;
  }
  if (text.length > this.maxDisplayLength) {
    // Truncate displayed string and add an ellipsis ('...').
    text = text.substring(0, this.maxDisplayLength - 2) + '\u2026';
  }
  // Replace whitespace with non-breaking spaces so the text doesn't collapse.
  text = text.replace(/\s/g, Blockly.Field.NBSP);
  if (this.sourceBlock_.RTL) {
    // The SVG is LTR, force text to be RTL.
    text += '\u200F';
  }
  return text;
};

/**
 * Get the text from this field.
 * @return {string} Current text.
 */
Blockly.Field.prototype.getText = function() {
  return this.text_;
};

/**
 * Set the text in this field.  Trigger a rerender of the source block.
 * @param {*} newText New text.
 */
Blockly.Field.prototype.setText = function(newText) {
  if (newText === null) {
    // No change if null.
    return;
  }
  newText = String(newText);
  if (newText === this.text_) {
    // No change.
    return;
  }
  this.text_ = newText;
  this.forceRerender();
};

/**
 * Force a rerender of the block that this field is installed on, which will
 * rerender this field and adjust for any sizing changes.
 * Other fields on the same block will not rerender, because their sizes have
 * already been recorded.
 * @package
 */
Blockly.Field.prototype.forceRerender = function() {
  this.isDirty_ = true;
  if (this.sourceBlock_ && this.sourceBlock_.rendered) {
    this.sourceBlock_.render();
    this.sourceBlock_.bumpNeighbours_();
  }
};

/**
 * By default there is no difference between the human-readable text and
 * the language-neutral values.  Subclasses (such as dropdown) may define this.
 * @return {string} Current value.
 */
Blockly.Field.prototype.getValue = function() {
  return this.getText();
};

/**
 * By default there is no difference between the human-readable text and
 * the language-neutral values.  Subclasses (such as dropdown) may define this.
 * @param {string} newValue New value.
 */
Blockly.Field.prototype.setValue = function(newValue) {
  if (newValue === null) {
    // No change if null.
    return;
  }
  // Validate input.
  var validated = this.callValidator(newValue);
  if (validated !== null) {
    newValue = validated;
  }
  // Check for change.
  var oldValue = this.getValue();
  if (oldValue == newValue) {
    return;
  }
  if (this.sourceBlock_ && Blockly.Events.isEnabled()) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this.sourceBlock_, 'field', this.name, oldValue, newValue));
  }
  this.setText(newValue);
};

/**
 * Handle a mouse down event on a field.
 * @param {!Event} e Mouse down event.
 * @protected
 */
Blockly.Field.prototype.onMouseDown_ = function(e) {
  if (!this.sourceBlock_ || !this.sourceBlock_.workspace) {
    return;
  }
  var gesture = this.sourceBlock_.workspace.getGesture(e);
  if (gesture) {
    gesture.setStartField(this);
  }
};

/**
 * Change the tooltip text for this field.
 * @param {string|!Element} _newTip Text for tooltip or a parent element to
 *     link to for its tooltip.
 */
Blockly.Field.prototype.setTooltip = function(_newTip) {
  // Non-abstract sub-classes may wish to implement this.  See FieldLabel.
};

/**
 * The element to bind the click handler to. If not set explicitly, defaults
 * to the SVG root of the field. When this element is
 * clicked on an editable field, the editor will open.
 * @return {!Element} Element to bind click handler to.
 * @private
 */
Blockly.Field.prototype.getClickTarget_ = function() {
  return this.clickTarget_ || this.getSvgRoot();
};

/**
 * Return the absolute coordinates of the top-left corner of this field.
 * The origin (0,0) is the top-left corner of the page body.
 * @return {!goog.math.Coordinate} Object with .x and .y properties.
 * @private
 */
Blockly.Field.prototype.getAbsoluteXY_ = function() {
  return goog.style.getPageOffset(this.borderRect_);
};

/**
 * Whether this field references any Blockly variables.  If true it may need to
 * be handled differently during serialization and deserialization.  Subclasses
 * may override this.
 * @return {boolean} True if this field has any variable references.
 * @package
 */
Blockly.Field.prototype.referencesVariables = function() {
  return false;
};
