package com.kesefhacham.quicktextures;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.network.chat.Component;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.server.packs.repository.PackRepository;

/**
 * Turns "my textures" on and off.
 *
 * <p>The on/off state is not saved anywhere: it is computed every time from the packs that are
 * actually enabled in the PackRepository. So everything stays in sync even if the player changes
 * packs from the regular game menu.
 */
public final class TextureToggler {
	private TextureToggler() {
	}

	/** Short press: if on, turn off; if off, turn on. */
	public static void toggle(Minecraft client) {
		PackRepository repository = client.getResourcePackRepository();
		// Rescan the resourcepacks folder, so a pack that was deleted is skipped and a new one is found.
		repository.reload();

		List<String> chosen = QuickTexturesConfig.getPacks();
		if (chosen.isEmpty()) {
			showMessage(client, Component.translatable("quicktextures.message.none_selected"));
			return;
		}

		List<String> present = presentPacks(repository, chosen);
		if (present.isEmpty()) {
			// Everything that was chosen was deleted from the folder.
			showMessage(client, Component.translatable("quicktextures.message.missing"));
			return;
		}

		if (isOn(repository, present)) {
			applySelection(client, withoutPacks(repository.getSelectedIds(), chosen));
			showMessage(client, Component.translatable("quicktextures.message.off"));
		} else {
			applySelection(client, withPacksOnTop(repository.getSelectedIds(), present));
			showMessage(client, Component.translatable("quicktextures.message.on"));
		}
	}

	/** Are my textures currently on? (= all the chosen packs that exist are enabled.) */
	public static boolean isOn(Minecraft client) {
		PackRepository repository = client.getResourcePackRepository();
		List<String> present = presentPacks(repository, QuickTexturesConfig.getPacks());
		return !present.isEmpty() && isOn(repository, present);
	}

	private static boolean isOn(PackRepository repository, List<String> present) {
		return repository.getSelectedIds().containsAll(present);
	}

	/**
	 * Called from the menu after the chosen list changed while the textures are on:
	 * removes the packs that were dropped from the list and adds the new ones, right away.
	 */
	public static void reapply(Minecraft client, List<String> oldChosen, List<String> newChosen) {
		PackRepository repository = client.getResourcePackRepository();
		List<String> ids = withoutPacks(repository.getSelectedIds(), oldChosen);
		List<String> present = presentPacks(repository, newChosen);
		if (present.isEmpty()) {
			applySelection(client, ids);
			showMessage(client, Component.translatable("quicktextures.message.off"));
			return;
		}
		applySelection(client, withPacksOnTop(ids, present));
		showMessage(client, Component.translatable("quicktextures.message.on"));
	}

	/** Only the chosen packs that still exist in the folder (deleted ones are skipped quietly). */
	private static List<String> presentPacks(PackRepository repository, List<String> chosen) {
		List<String> present = new ArrayList<>();
		for (String id : chosen) {
			if (repository.getPack(id) != null && !present.contains(id)) {
				present.add(id);
			}
		}
		return present;
	}

	/** The enabled list without my packs - other packs the player enabled stay as they are. */
	private static List<String> withoutPacks(Collection<String> selected, List<String> mine) {
		List<String> ids = new ArrayList<>(selected);
		ids.removeAll(mine);
		return ids;
	}

	/**
	 * Adds my packs on top of the existing ones. In PackRepository the end of the list is the
	 * highest priority, so they go at the end, in the order they were chosen.
	 */
	private static List<String> withPacksOnTop(Collection<String> selected, List<String> mine) {
		List<String> ids = new ArrayList<>(selected);
		ids.removeAll(mine);
		ids.addAll(mine);
		return ids;
	}

	/**
	 * Sets the enabled list, updates options.resourcePacks, saves options.txt and reloads the packs.
	 * The options update matches what the game does itself when "Done" is pressed in the resource
	 * packs screen.
	 */
	private static void applySelection(Minecraft client, List<String> ids) {
		PackRepository repository = client.getResourcePackRepository();
		repository.setSelected(ids);

		Options options = client.options;
		options.resourcePacks.clear();
		options.incompatibleResourcePacks.clear();
		for (Pack pack : repository.getSelectedPacks()) {
			if (pack.isFixedPosition()) {
				// Packs like the vanilla default are managed by the game itself and don't go in options.txt.
				continue;
			}
			options.resourcePacks.add(pack.getId());
			if (!pack.getCompatibility().isCompatible()) {
				// Without this the game drops the pack on the next startup (like "enable anyway" in the game).
				options.incompatibleResourcePacks.add(pack.getId());
			}
		}
		options.save();
		client.reloadResourcePacks();
	}

	private static void showMessage(Minecraft client, Component message) {
		client.gui.hud.setOverlayMessage(message, false);
	}
}
