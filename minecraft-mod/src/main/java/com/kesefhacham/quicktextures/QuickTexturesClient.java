package com.kesefhacham.quicktextures;

import com.mojang.blaze3d.platform.InputConstants;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;

/**
 * Entry point. One key: short press = turn "my textures" on/off,
 * long press (10 ticks = 500ms) = open the pack picker.
 */
public final class QuickTexturesClient implements ClientModInitializer {
	public static final String MOD_ID = "quicktextures";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	/** How many ticks count as a long press (20 ticks = one second). */
	private static final int LONG_PRESS_TICKS = 10;

	private static KeyMapping toggleKey;

	/** How many ticks the key has been held in the current press. */
	private int heldTicks = 0;
	/** The menu already opened in this press - do nothing on release. */
	private boolean longPressHandled = false;
	/** The press started while a screen was open or packs were reloading - ignore it until release. */
	private boolean ignoreUntilRelease = false;

	@Override
	public void onInitializeClient() {
		QuickTexturesConfig.load();

		KeyMapping.Category category = KeyMapping.Category.register(
				Identifier.fromNamespaceAndPath(MOD_ID, "main"));
		toggleKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key." + MOD_ID + ".toggle",
				InputConstants.Type.KEYSYM,
				GLFW.GLFW_KEY_J,
				category));

		ClientTickEvents.END_CLIENT_TICK.register(this::onEndTick);
	}

	private void onEndTick(Minecraft client) {
		// consumeClick catches even a very quick tap that started and ended between two ticks.
		boolean clicked = false;
		while (toggleKey.consumeClick()) {
			clicked = true;
		}
		boolean down = toggleKey.isDown();

		boolean busy = client.gui.screen() != null || client.gui.overlay() != null;
		if (busy) {
			// Another screen is open, or resource packs are reloading (LoadingOverlay).
			if (down || clicked) {
				ignoreUntilRelease = true;
			}
			heldTicks = 0;
			longPressHandled = false;
			return;
		}

		if (ignoreUntilRelease) {
			if (!down) {
				ignoreUntilRelease = false;
			}
			heldTicks = 0;
			return;
		}

		if (down) {
			heldTicks++;
			if (heldTicks >= LONG_PRESS_TICKS && !longPressHandled) {
				longPressHandled = true;
				client.gui.setScreen(new PackPickerScreen(null));
			}
			return;
		}

		// The key is not held: if a press just ended, decide what it was.
		boolean pressEnded = heldTicks > 0 || clicked;
		if (pressEnded && !longPressHandled) {
			TextureToggler.toggle(client);
		}
		heldTicks = 0;
		longPressHandled = false;
	}
}
